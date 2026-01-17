require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import Models
const Product = require('./models/Product');
const Transaction = require('./models/Transaction');
const WorkOrder = require('./models/WorkOrder');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.log("❌ MongoDB Connection Error:", err));

// --- API ROUTES ---

// 1. GET ALL PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ name: 1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. ADD NEW PRODUCT
app.post('/api/products', async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    await newProduct.save();
    res.json(newProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. UPDATE STOCK (With History Log)
app.put('/api/products/:id/stock', async (req, res) => {
  const { adjustment, reason } = req.body; 
  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { 
        $inc: { quantity: adjustment }, 
        $set: { lastUpdated: Date.now() }
      },
      { new: true } 
    );
    if (!updatedProduct) return res.status(404).json({ error: "Product not found" });

    // Log Transaction
    await new Transaction({
      type: adjustment > 0 ? "IN" : "OUT",
      productId: updatedProduct._id,
      productName: updatedProduct.name,
      quantity: Math.abs(adjustment),
      reason: reason || "Manual Update",
    }).save();

    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET TRANSACTION HISTORY
app.get('/api/transactions', async (req, res) => {
  try {
    const history = await Transaction.find().sort({ date: -1 }).limit(50);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. SAVE RECIPE (Manufacturing) - THIS WAS MISSING OR BROKEN
app.put('/api/products/:id/recipe', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    product.recipe = req.body.recipe; // Save the ingredients list
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. MANUFACTURE PRODUCTS (The Engine) - THIS WAS MISSING
app.post('/api/manufacture', async (req, res) => {
  const { productId, quantityToBuild } = req.body; 

  try {
    // A. Get Product & Recipe
    const finishedGood = await Product.findById(productId);
    if (!finishedGood) return res.status(404).json({ error: "Product not found" });
    
    if (!finishedGood.recipe || finishedGood.recipe.length === 0) {
      return res.status(400).json({ error: "No recipe defined. Please add ingredients first." });
    }

    // B. Check Stock Levels
    for (const item of finishedGood.recipe) {
      const ingredient = await Product.findById(item.ingredientId);
      if (!ingredient) return res.status(400).json({ error: `Ingredient not found` });
      
      const totalNeeded = item.qtyRequired * quantityToBuild;
      if (ingredient.quantity < totalNeeded) {
        return res.status(400).json({ 
          error: `Not enough ${ingredient.name}. Need ${totalNeeded}, have ${ingredient.quantity}` 
        });
      }
    }

    // C. Deduct Ingredients
    for (const item of finishedGood.recipe) {
      await Product.findByIdAndUpdate(item.ingredientId, {
        $inc: { quantity: -(item.qtyRequired * quantityToBuild) }
      });
      
      // Log Ingredient Usage
      await new Transaction({
        type: "OUT",
        productId: item.ingredientId,
        productName: item.ingredientName,
        quantity: item.qtyRequired * quantityToBuild,
        reason: `Used for ${quantityToBuild} x ${finishedGood.name}`
      }).save();
    }

    // D. Add Finished Good
    const updatedFinishedGood = await Product.findByIdAndUpdate(
      productId,
      { $inc: { quantity: Number(quantityToBuild) } },
      { new: true }
    );

    // Log Production
    await new Transaction({
      type: "IN",
      productId: finishedGood._id,
      productName: finishedGood.name,
      quantity: quantityToBuild,
      reason: "Manufacturing Production"
    }).save();

    res.json({ message: "Success", product: updatedFinishedGood });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 7. DELETE TRANSACTION (Clean up Audit Log) - NEW
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: "Transaction deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 8. ISSUE WORK ORDER (Give Material to Middle Man)
// 8. ISSUE WORK ORDER (UPDATED FOR SALES vs ASSEMBLY)
app.post('/api/workorders/issue', async (req, res) => {
  const { assignedTo, productId, quantity, type } = req.body; // type = 'ASSEMBLY' or 'SALES'

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // === SCENARIO A: SALES/DELIVERY ===
    // We are giving Rahul the FINISHED GOOD directly from our stock.
    if (type === 'SALES') {
      if (product.quantity < quantity) {
        return res.status(400).json({ error: `Not enough ${product.name} in stock to give to Rahul.` });
      }

      // Deduct Finished Good immediately
      await Product.findByIdAndUpdate(productId, { $inc: { quantity: -quantity } });

      // Log it
      await new Transaction({
        type: "OUT",
        productId: product._id,
        productName: product.name,
        quantity: quantity,
        reason: `TRANSIT: Given to ${assignedTo}`
      }).save();
    }

    // === SCENARIO B: ASSEMBLY (MANUFACTURING) ===
    // We are giving Rahul INGREDIENTS to build the product.
    else {
      if (!product.recipe || product.recipe.length === 0) {
        return res.status(400).json({ error: "No recipe defined for this product." });
      }

      // Check & Deduct Ingredients
      for (const item of product.recipe) {
        const ingredient = await Product.findById(item.ingredientId);
        const totalNeeded = item.qtyRequired * quantity;

        if (ingredient.quantity < totalNeeded) {
          return res.status(400).json({ error: `Not enough ${ingredient.name} (Need ${totalNeeded})` });
        }

        // Deduct Ingredient
        await Product.findByIdAndUpdate(item.ingredientId, { $inc: { quantity: -totalNeeded } });

        // Log Ingredient Usage
        await new Transaction({
          type: "OUT",
          productId: item.ingredientId,
          productName: item.ingredientName,
          quantity: totalNeeded,
          reason: `Given to ${assignedTo} to build ${product.name}`
        }).save();
      }
    }

    // Create the Work Order Record
    const newOrder = new WorkOrder({
      assignedTo,
      productId,
      productName: product.name,
      quantity,
      type: type || 'ASSEMBLY' // Save the type
    });
    await newOrder.save();

    res.json(newOrder);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// 9. GET WORK ORDERS
app.get('/api/workorders', async (req, res) => {
  try {
    const orders = await WorkOrder.find().sort({ status: -1, dateIssued: -1 }); // Open first
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 10. COMPLETE WORK ORDER (Receive Finished Goods)
app.put('/api/workorders/:id/complete', async (req, res) => {
  try {
    const order = await WorkOrder.findById(req.params.id);
    if (order.status === 'COMPLETED') return res.status(400).json({ error: "Already completed" });

    // A. Add Finished Goods to Stock
    await Product.findByIdAndUpdate(order.productId, {
      $inc: { quantity: order.quantity }
    });

    // B. Log the IN transaction
    await new Transaction({
      type: "IN",
      productId: order.productId,
      productName: order.productName,
      quantity: order.quantity,
      reason: `Received from Job Work (${order.assignedTo})`
    }).save();

    // C. Mark Order as Completed
    order.status = "COMPLETED";
    order.dateCompleted = Date.now();
    await order.save();

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. DIRECT DELIVERY (Rahul -> Vendor)
// 11. DIRECT DELIVERY (Rahul -> Vendor) - FIXED LOGIC
app.put('/api/workorders/:id/deliver', async (req, res) => {
  const { clientName } = req.body; 

  try {
    const order = await WorkOrder.findById(req.params.id);
    if (order.status !== 'OPEN') return res.status(400).json({ error: "Order not open" });

    // === SCENARIO A: SALES (Rahul was just a delivery boy) ===
    if (order.type === 'SALES') {
      // Stock was ALREADY deducted when we issued it.
      // We just need to record the REVENUE now.
      
      // We create a special "REVENUE_RECORD" transaction.
      // This confirms the sale happened. 
      await new Transaction({
        type: "OUT", 
        productId: order.productId, 
        productName: order.productName, 
        quantity: order.quantity, 
        reason: `SOLD: ${clientName} (via ${order.assignedTo})` // Keyword "SOLD" triggers revenue
      }).save();
    }

    // === SCENARIO B: ASSEMBLY (Rahul built it and dropped it off) ===
    else {
      // 1. Virtual Stock IN (He built it)
      await new Transaction({
        type: "IN", 
        productId: order.productId, 
        productName: order.productName, 
        quantity: order.quantity, 
        reason: `Finished by ${order.assignedTo} (Virtual)`
      }).save();

      // 2. Immediate Sale OUT
      await new Transaction({
        type: "OUT", 
        productId: order.productId, 
        productName: order.productName, 
        quantity: order.quantity, 
        reason: `SOLD: ${clientName} (Direct from Job Work)`
      }).save();
    }

    // Close the Order
    order.status = "DELIVERED";
    order.dateCompleted = Date.now();
    await order.save();

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));