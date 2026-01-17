const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  type: { type: String, required: true }, // "IN" or "OUT"
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  reason: { type: String, default: "Manual Update" },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);