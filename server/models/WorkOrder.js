const mongoose = require('mongoose');

const WorkOrderSchema = new mongoose.Schema({
  assignedTo: { type: String, required: true },     // Worker Name (e.g., "Rahul")
  assignedToId: { type: String, required: true },   // Worker ID (e.g., "65a...") <--- NEW FIELD
  productName: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: { type: Number, required: true },
  type: { type: String, default: "ASSEMBLY" },
  
  // Changed "OPEN" to "PENDING" to match our new status badges
  status: { type: String, enum: ['PENDING', 'COMPLETED'], default: "PENDING" },
  
  // Dates
  assignedAt: { type: Date, default: Date.now },    // When job started
  completedAt: { type: Date }                       // When job finished
});

module.exports = mongoose.model('WorkOrder', WorkOrderSchema);