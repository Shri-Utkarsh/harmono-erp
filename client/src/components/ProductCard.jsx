import { useState } from 'react';
import axios from 'axios';

function ProductCard({ product, refreshData }) {
  // State for inputs
  const [qty, setQty] = useState(""); // Default is empty so placeholder shows
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  // Helper to handle the API call
  const handleTransaction = async (type) => {
    // 1. Basic Validation
    if (!qty || Number(qty) <= 0) return alert("Please enter a valid quantity");
    if (!reason) return alert("Please enter a reason (e.g. Vendor Name)");

    // 2. Prevent selling more than you have
    if (type === 'OUT' && Number(qty) > product.quantity) {
      return alert(`Error: You only have ${product.quantity} units in stock!`);
    }

    setLoading(true);
    
    // 3. Determine math: IN is positive (+), OUT is negative (-)
    const adjustment = type === 'IN' ? Number(qty) : -Number(qty);

    try {
      await axios.put(`http://localhost:5000/api/products/${product._id}/stock`, { 
        adjustment, 
        reason 
      });
      
      // 4. Cleanup
      setQty("");    // Clear number box
      setReason(""); // Clear reason box
      refreshData(); // Refresh the App to show new data
    } catch (err) {
      alert("Transaction failed. Check server.");
      console.error(err);
    }
    setLoading(false);
  };

  // Logic for styling
  const isLowStock = product.quantity < product.minLevel;

  return (
    <div className={`flex flex-col justify-between p-5 rounded-lg shadow-md border-l-4 transition-all duration-200 ${
      isLowStock ? 'bg-red-50 border-red-500' : 'bg-white border-blue-500'
    }`}>
      
      {/* CARD HEADER */}
      <div className="mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg text-slate-800">{product.name}</h3>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {product.category}
            </span>
          </div>
          <div className="text-right">
             <span className={`text-2xl font-bold block ${isLowStock ? 'text-red-600' : 'text-slate-700'}`}>
               {product.quantity}
             </span>
             <span className="text-xs text-slate-400">Units</span>
          </div>
        </div>
      </div>
      
      {/* INPUTS SECTION */}
      <div className="space-y-3">
        {/* Quantity Input */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-400 w-16">Qty:</span>
          <input 
            type="number" 
            min="1"
            placeholder="0" 
            className="w-full border border-gray-300 p-2 rounded focus:outline-blue-500 font-mono"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        {/* Reason Input */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-400 w-16">Note:</span>
          <input 
            type="text" 
            placeholder="Reason (e.g. Vendor A)" 
            className="w-full border border-gray-300 p-2 rounded focus:outline-blue-500 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        
        {/* ACTION BUTTONS */}
        <div className="flex gap-3 mt-2">
          <button 
            onClick={() => handleTransaction('IN')}
            disabled={loading}
            className="flex-1 bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
          >
            + IN (Add)
          </button>
          
          <button 
            onClick={() => handleTransaction('OUT')}
            disabled={loading || (qty > product.quantity)} // Auto-disable if not enough stock
            className={`flex-1 text-white py-2 rounded font-bold transition shadow-sm ${
              (qty > product.quantity) 
                ? 'bg-gray-400 cursor-not-allowed' // Grey out if invalid
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            - OUT (Sell)
          </button>
        </div>
      </div>
      
      {/* WARNING LABEL */}
      {isLowStock && (
        <div className="mt-4 p-2 bg-red-100 text-red-700 text-xs font-bold text-center rounded">
          ⚠ LOW STOCK WARNING
        </div>
      )}
    </div>
  );
}

export default ProductCard;