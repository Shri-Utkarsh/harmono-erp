const mongoose = require('mongoose');

const WorkOrderSchema = new mongoose.Schema({
  assignedTo: { type: String, required: true },     
  assignedToId: { type: String, required: true },   
  assignedToEmpId: { type: String },                // NEW: Save "EMP-101" for history
  productName: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: { type: Number, required: true },
  type: { type: String, default: "ASSEMBLY" },
  status: { type: String, enum: ['PENDING', 'COMPLETED'], default: "PENDING" },
  
  // Dates
  assignedAt: { type: Date, default: Date.now },    
  completedAt: { type: Date },

  // NEW: PROOF OF DELIVERY
  deliveryProof: {
    clientName: String,
    photo: String,       // We will store the image as a Base64 string
    location: {          // GPS Coordinates
      lat: Number,
      lng: Number
    }
  }
});

module.exports = mongoose.model('WorkOrder', WorkOrderSchema);