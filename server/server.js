require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ==========================================
// 1. DATABASE MODELS
// ==========================================

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'factory', 'delivery'], default: 'factory' },
  employeeId: { type: String }, 
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  customId: { type: String, default: 'N/A' }, 
  category: { type: String, default: 'Raw Material' }, 
  quantity: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  minLevel: { type: Number, default: 10 },
  recipe: [{ ingredientId: String, ingredientName: String, qtyRequired: Number }],
  lastUpdated: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

const TransactionSchema = new mongoose.Schema({
  productId: String,
  productName: String,
  productCustomId: String,
  workOrderId: String, // Critical Link for Excel
  type: { type: String, enum: ['IN', 'OUT'] },
  quantity: Number,
  reason: String,
  date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const WorkOrderSchema = new mongoose.Schema({
  assignedTo: String,     
  assignedToId: String,   
  assignedToEmpId: String,
  productName: String,
  productCustomId: String,
  productId: String,
  quantity: Number,
  clientName: String, 
  type: { type: String, default: "ASSEMBLY" }, 
  status: { type: String, enum: ['PENDING', 'COMPLETED'], default: "PENDING" },
  assignedAt: { type: Date, default: Date.now },    
  completedAt: Date,
  proof: {
    photo: String, 
    location: { lat: Number, lng: Number }
  }
});
const WorkOrder = mongoose.model('WorkOrder', WorkOrderSchema);

// ==========================================
// 2. SERVER SETUP
// ==========================================

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const app = express();

app.use(express.json({ limit: '50mb' })); 
app.use(cors());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// ==========================================
// 3. API ROUTES
// ==========================================

// --- PRODUCTS ---
app.get('/api/products', async (req, res) => res.json(await Product.find().sort({ name: 1 })));
app.post('/api/products', async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    await newProduct.save();
    res.json(newProduct);
  } catch(e) { res.status(500).json({error: e.message}) }
});

app.put('/api/products/:id/stock', async (req, res) => {
    const { adjustment, reason } = req.body; 
    try {
      const qtyChange = Number(adjustment);
      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        { $inc: { quantity: qtyChange }, $set: { lastUpdated: Date.now() } },
        { new: true } 
      );
      if (!updatedProduct) return res.status(404).json({ error: "Product not found" });
  
      await new Transaction({
        type: qtyChange > 0 ? "IN" : "OUT",
        productId: updatedProduct._id,
        productName: updatedProduct.name,
        productCustomId: updatedProduct.customId,
        quantity: Math.abs(qtyChange),
        reason: reason || "Manual Update",
      }).save();
  
      res.json(updatedProduct);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id/recipe', async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { recipe: req.body.recipe });
  res.json({ success: true });
});

// --- TRANSACTIONS ---
app.get('/api/transactions', async (req, res) => res.json(await Transaction.find().sort({ date: -1 }).limit(100)));
app.delete('/api/transactions/:id', async (req, res) => {
    await Transaction.findByIdAndDelete(req.params.id);
    res.json({success: true});
});

// --- MANUFACTURE ---
app.post('/api/manufacture', async (req, res) => {
  const { productId, quantityToBuild } = req.body;
  try {
    const product = await Product.findById(productId);
    if (product.recipe && product.recipe.length > 0) {
        for (const item of product.recipe) {
            const ing = await Product.findById(item.ingredientId);
            if (ing.quantity < item.qtyRequired * quantityToBuild) return res.status(400).json({ error: `Low Stock: ${ing.name}` });
            await Product.findByIdAndUpdate(item.ingredientId, { $inc: { quantity: -(item.qtyRequired * quantityToBuild) } });
            await new Transaction({ 
                type: 'OUT', 
                productId: item.ingredientId, 
                productName: item.ingredientName, 
                productCustomId: ing.customId, 
                quantity: item.qtyRequired * quantityToBuild, 
                reason: `Ingredient for ${product.name}` 
            }).save();
        }
    }
    await Product.findByIdAndUpdate(productId, { $inc: { quantity: quantityToBuild } });
    await new Transaction({ type: 'IN', productId, productName: product.name, productCustomId: product.customId, quantity: quantityToBuild, reason: 'Manufacturing Production' }).save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- WORK ORDERS (FIXED LOGIC HERE) ---
app.get('/api/users/workers', async (req, res) => {
  res.json(await User.find({ role: { $ne: 'admin' } }).select('name role employeeId'));
});

app.post('/api/workorders/issue', async (req, res) => {
  const { assignedTo, assignedToId, assignedToEmpId, productId, quantity, type, clientName } = req.body;
  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // 1. FIRST VALIDATE STOCK (Do not create order yet)
    if (type === 'SALES') {
        if(product.quantity < quantity) {
            return res.status(400).json({error: `Not enough stock! Have: ${product.quantity}, Need: ${quantity}`});
        }
    } else {
        // Assembly Check
        if (product.recipe && product.recipe.length > 0) {
             for(const item of product.recipe) {
                 const ing = await Product.findById(item.ingredientId);
                 if (ing.quantity < (item.qtyRequired * quantity)) {
                     return res.status(400).json({error: `Not enough ${ing.name}`});
                 }
             }
        }
    }

    // 2. STOCK EXISTS -> CREATE ORDER OBJECT (But don't save yet)
    const order = new WorkOrder({ 
        assignedTo, assignedToId, assignedToEmpId, 
        productId, productName: product.name, productCustomId: product.customId,
        quantity, type, clientName, status: 'PENDING',
        assignedAt: new Date()
    });

    // 3. DEDUCT STOCK & LOG TRANSACTION (With WorkOrder ID)
    if (type === 'SALES') {
        await Product.findByIdAndUpdate(productId, { $inc: { quantity: -quantity } });
        
        await new Transaction({ 
            type: 'OUT', 
            productId, 
            productName: product.name, 
            productCustomId: product.customId, 
            quantity, 
            workOrderId: order._id, // LINKING ID
            reason: `Out for Delivery: ${clientName || assignedTo}` 
        }).save();

    } else {
        // Assembly Deduction
        if (product.recipe && product.recipe.length > 0) {
             for(const item of product.recipe) {
                 const ing = await Product.findById(item.ingredientId);
                 await Product.findByIdAndUpdate(item.ingredientId, { $inc: { quantity: -(item.qtyRequired * quantity) } });
                 await new Transaction({ 
                     type: 'OUT', 
                     productId: item.ingredientId, 
                     productName: item.ingredientName, 
                     productCustomId: ing ? ing.customId : 'N/A', 
                     quantity: item.qtyRequired * quantity, 
                     workOrderId: order._id, // LINKING ID
                     reason: `Used to build ${product.name} (Job: ${assignedTo})` 
                 }).save();
             }
        }
    }

    // 4. FINALLY SAVE ORDER (Success)
    await order.save();
    res.json(order);

  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/workorders', async (req, res) => res.json(await WorkOrder.find().sort({ status: -1, assignedAt: -1 })));

app.put('/api/workorders/:id/complete', async (req, res) => {
    const { photo } = req.body;
    try {
        const order = await WorkOrder.findById(req.params.id);
        order.status = 'COMPLETED';
        order.completedAt = Date.now();
        order.proof = { photo };
        await order.save();

        if(order.type === 'ASSEMBLY') {
            await Product.findByIdAndUpdate(order.productId, { $inc: { quantity: order.quantity } });
            await new Transaction({ 
                type: 'IN', 
                productId: order.productId, 
                productName: order.productName, 
                productCustomId: order.productCustomId, 
                quantity: order.quantity, 
                workOrderId: order._id, // Link for Excel
                reason: `Finished by ${order.assignedTo}` 
            }).save();
        }
        res.json(order);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/workorders/:id/deliver', async (req, res) => {
    const { photo, location } = req.body;
    try {
        const order = await WorkOrder.findById(req.params.id);
        order.status = 'COMPLETED';
        order.completedAt = Date.now();
        order.proof = { photo, location };
        await order.save();
        
        await new Transaction({ 
            type: 'OUT', 
            productId: order.productId, 
            productName: order.productName, 
            productCustomId: order.productCustomId, 
            quantity: order.quantity, 
            workOrderId: order._id, // Link for Excel
            reason: `SOLD: ${order.clientName || 'Counter Sale'}` 
        }).save();
        res.json(order);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- AUTH ---
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const count = await User.countDocuments();
        const employeeId = `EMP-${100 + count + 1}`;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword, role, employeeId });
        await newUser.save();
        res.json({ message: "Created" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(400).json({ error: "Invalid login" });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, role: user.role, employeeId: user.employeeId } });
});

app.delete('/api/users/:id', async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));