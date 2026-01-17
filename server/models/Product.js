const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true }, 
  quantity: { type: Number, default: 0 },
  minLevel: { type: Number, default: 10 },
  
  // NEW FINANCIAL FIELDS
  price: { type: Number, default: 0 }, // Cost Price for Raw Material, Selling Price for Finished Good
  
  lastUpdated: { type: Date, default: Date.now },
  recipe: [{
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    ingredientName: { type: String },
    qtyRequired: { type: Number }
  }]
});

module.exports = mongoose.model('Product', ProductSchema);