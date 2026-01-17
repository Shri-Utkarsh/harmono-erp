const mongoose = require('mongoose');

const WorkOrderSchema = new mongoose.Schema({
  assignedTo: { type: String, required: true }, // Name of Middle Man / Vendor
  productName: { type: String, required: true }, // What are they building?
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: { type: Number, required: true }, // How many to build?
  type: { type: String, default: "ASSEMBLY" }, //'ASSEMBLY' (Making) or 'SALES' (Selling)
  status: { type: String, default: "OPEN" }, // OPEN or COMPLETED
  dateIssued: { type: Date, default: Date.now },
  dateCompleted: { type: Date }
});

module.exports = mongoose.model('WorkOrder', WorkOrderSchema);