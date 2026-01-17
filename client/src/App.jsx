import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import ProductCard from "./components/ProductCard";

function App() {
  const [activeTab, setActiveTab] = useState("DASHBOARD");

  // Data States
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);

  // Forms & Inputs
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "Raw Material",
    minLevel: 10,
    price: 0,
  });
  const [jobForm, setJobForm] = useState({ productId: "", assignedTo: "", quantity: "", type: "ASSEMBLY" });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [buildQty, setBuildQty] = useState("");
  const [newIngredient, setNewIngredient] = useState({ id: "", qty: 1 });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");

  // --- API CALLS ---
  const refreshAll = async () => {
    try {
      const [pRes, tRes, wRes] = await Promise.all([
        axios.get("http://localhost:5000/api/products"),
        axios.get("http://localhost:5000/api/transactions"),
        axios.get("http://localhost:5000/api/workorders"),
      ]);
      setProducts(pRes.data);
      setTransactions(tRes.data);
      setWorkOrders(wRes.data);

      if (selectedProduct) {
        const updated = pRes.data.find((p) => p._id === selectedProduct._id);
        setSelectedProduct(updated);
      }
    } catch (err) {
      console.error("Error fetching data", err);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  // --- HANDLERS ---
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name) return;
    try {
      await axios.post("http://localhost:5000/api/products", newProduct);
      alert("✅ Item Added Successfully!");
      setNewProduct({
        name: "",
        category: "Raw Material",
        minLevel: 10,
        price: 0,
      });
      refreshAll();
    } catch (err) {
      alert("Error adding product");
    }
  };

  const handleIssueJob = async (e) => {
    e.preventDefault();
    if (!jobForm.productId || !jobForm.assignedTo || !jobForm.quantity)
      return alert("Fill all fields");
    try {
      await axios.post("http://localhost:5000/api/workorders/issue", jobForm);
      alert(`Job assigned.`);
      setJobForm({ productId: "", assignedTo: "", quantity: "" });
      refreshAll();
    } catch (err) {
      alert("Failed: " + err.response?.data?.error);
    }
  };
  const handleCompleteJob = async (id) => {
    if (!window.confirm("Receive goods?")) return;
    try {
      await axios.put(`http://localhost:5000/api/workorders/${id}/complete`);
      refreshAll();
    } catch (err) {
      alert("Error");
    }
  };
  const handleDeleteTransaction = async (id) => {
    if (!window.confirm("Delete?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/transactions/${id}`);
      refreshAll();
    } catch (err) {
      alert("Failed");
    }
  };
  const addToRecipe = async () => {
    if (!selectedProduct || !newIngredient.id) return;
    const ingredientObj = products.find((p) => p._id === newIngredient.id);
    let updatedRecipe = [...(selectedProduct.recipe || [])];
    const existingIndex = updatedRecipe.findIndex(
      (item) => item.ingredientId === newIngredient.id,
    );
    if (existingIndex >= 0)
      updatedRecipe[existingIndex].qtyRequired =
        Number(updatedRecipe[existingIndex].qtyRequired) +
        Number(newIngredient.qty);
    else
      updatedRecipe.push({
        ingredientId: newIngredient.id,
        ingredientName: ingredientObj.name,
        qtyRequired: Number(newIngredient.qty),
      });
    try {
      await axios.put(
        `http://localhost:5000/api/products/${selectedProduct._id}/recipe`,
        { recipe: updatedRecipe },
      );
      refreshAll();
    } catch (err) {
      alert("Failed");
    }
  };
  const removeFromRecipe = async (index) => {
    const updated = selectedProduct.recipe.filter((_, i) => i !== index);
    try {
      await axios.put(
        `http://localhost:5000/api/products/${selectedProduct._id}/recipe`,
        { recipe: updated },
      );
      refreshAll();
    } catch (err) {
      alert("Failed");
    }
  };
  const handleManufacture = async () => {
    if (!buildQty) return;
    try {
      await axios.post("http://localhost:5000/api/manufacture", {
        productId: selectedProduct._id,
        quantityToBuild: Number(buildQty),
      });
      alert("Done!");
      setBuildQty("");
      refreshAll();
    } catch (err) {
      alert("Failed: " + err.response?.data?.error);
    }
  };

// --- DASHBOARD MATH ---
  const dashboardStats = useMemo(() => {
    // 1. Inventory Value
    const totalValue = products.reduce((acc, p) => acc + (p.quantity * (p.price || 0)), 0);
    
    // 2. Low Stock
    const lowStockCount = products.filter(p => p.quantity < p.minLevel).length;
    
    // 3. Pending Jobs
    const pendingJobs = workOrders.filter(w => w.status === 'OPEN').length;

    // 4. TOTAL REVENUE (FIXED)
    // Only count transactions where the reason starts with "SOLD"
    const totalRevenue = transactions
      .filter(t => t.type === 'OUT' && t.reason.startsWith('SOLD')) 
      .reduce((acc, t) => {
        const product = products.find(p => p.name === t.productName);
        const price = product ? product.price : 0;
        return acc + (t.quantity * price);
      }, 0);

    return { totalValue, lowStockCount, pendingJobs, totalRevenue };
  }, [products, workOrders, transactions]);

  const finishedGoods = products.filter((p) => p.category === "Finished Good");
  const rawMaterials = products.filter((p) => p.category !== "Finished Good");
  const processedTransactions = [...transactions].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );

  // --- HANDLER: EXPORT TO EXCEL ---
  const handleExport = () => {
    // 1. Define Headers
    const headers = [
      "Date",
      "Item Name",
      "Type",
      "Quantity",
      "Reason / Vendor",
      "Transaction ID",
    ];

    // 2. Convert Data to CSV Format
    const csvRows = transactions.map((t) => {
      return [
        new Date(t.date).toLocaleDateString(), // Date
        t.productName, // Item
        t.type, // IN/OUT
        t.quantity, // Qty
        `"${t.reason}"`, // Reason (wrapped in quotes to handle commas)
        t._id, // ID
      ].join(",");
    });

    // 3. Combine Headers and Rows
    const csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      csvRows.join("\n");

    // 4. Trigger Download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Harmono_Report_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- HANDLER: DIRECT DELIVERY (RAHUL -> VENDOR) ---
  const handleDirectDelivery = async (id) => {
    // 1. Ask Admin who received the product
    const clientName = prompt(
      "To whom did Rahul deliver the product? (e.g. Vendor A)",
    );
    if (!clientName) return; // Cancelled

    try {
      await axios.put(`http://localhost:5000/api/workorders/${id}/deliver`, {
        clientName,
      });
      alert("✅ Delivery Recorded! Stock adjusted virtually.");
      refreshAll();
    } catch (err) {
      alert("Error: " + err.response?.data?.error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-800">
      {/* --- TOP NAVIGATION BAR --- */}
      <header className="bg-white p-4 rounded-lg shadow-sm mb-6 flex flex-col md:flex-row justify-between items-center border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            HARMONO <span className="text-blue-600">ERP</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Inventory & Manufacturing System
          </p>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mt-4 md:mt-0">
          {["DASHBOARD", "INVENTORY", "MANUFACTURING", "JOBWORK"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-all duration-200 ${
                activeTab === tab
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* ==========================
          TAB 1: CEO DASHBOARD
         ========================== */}
      {activeTab === "DASHBOARD" && (
        <div className="max-w-6xl mx-auto space-y-6">
          {/* STAT CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Total Assets Value
              </h3>
              <p className="text-3xl font-extrabold text-slate-800 mt-2">
                ₹ {dashboardStats.totalValue.toLocaleString("en-IN")}
              </p>
            </div>
            {/* CARD 4: TOTAL REVENUE (NEW) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Total Revenue (Sales)</h3>
              <p className="text-3xl font-extrabold text-green-600 mt-2">
                ₹ {dashboardStats.totalRevenue.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-gray-400 mt-1">Value of goods sold</p>
            </div>
            {/* EXPORT BUTTON */}
            <div className="flex justify-end mb-4">
              <button
                onClick={handleExport}
                className="bg-green-600 text-white px-6 py-2 rounded shadow-sm hover:bg-green-700 font-bold flex items-center gap-2"
              >
                📄 Download Excel Report
              </button>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-red-500">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Low Stock Alerts
              </h3>
              <p className="text-3xl font-extrabold text-red-600 mt-2">
                {dashboardStats.lowStockCount}{" "}
                <span className="text-sm text-slate-400 font-normal">
                  Items
                </span>
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Active Job Works
              </h3>
              <p className="text-3xl font-extrabold text-purple-600 mt-2">
                {dashboardStats.pendingJobs}{" "}
                <span className="text-sm text-slate-400 font-normal">
                  Orders
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* TABLE A: LOW STOCK (CRITICAL) */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                <h3 className="font-bold text-red-700 flex items-center gap-2">
                  ⚠️ Critical Low Stock
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-left">Item</th>
                    <th className="p-3 text-left">Current</th>
                    <th className="p-3 text-left">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {products
                    .filter((p) => p.quantity < p.minLevel)
                    .map((p) => (
                      <tr key={p._id}>
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 text-red-600 font-bold">
                          {p.quantity}
                        </td>
                        <td className="p-3 text-slate-500">
                          Min: {p.minLevel}
                        </td>
                      </tr>
                    ))}
                  {products.filter((p) => p.quantity < p.minLevel).length ===
                    0 && (
                    <tr>
                      <td
                        colSpan="3"
                        className="p-6 text-center text-slate-400 italic"
                      >
                        Everything is fully stocked! ✅
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* TABLE B: RECENTLY ADDED ITEMS (So you can see Motherboard!) */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-blue-50 p-4 border-b border-blue-100">
                <h3 className="font-bold text-blue-700">
                  📦 All Inventory Overview
                </h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Item Name</th>
                      <th className="p-3 text-left">Price</th>
                      <th className="p-3 text-left">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {products.map((p) => (
                      <tr key={p._id}>
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 text-slate-500">₹{p.price}</td>
                        <td className="p-3 font-bold bg-slate-50">
                          {p.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================
          TAB 2: INVENTORY
         ========================== */}
      {activeTab === "INVENTORY" && (
        <div className="max-w-6xl mx-auto">
          {/* --- NEW ITEM FORM (CLEARLY LABELED) --- */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 mb-8">
            <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
              <span className="bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">
                ＋
              </span>
              Add New Item
            </h2>

            <form onSubmit={handleAddProduct}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                {/* 1. Name */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Item Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Motherboard, 5mm Screw"
                    className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newProduct.name}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, name: e.target.value })
                    }
                  />
                </div>

                {/* 2. Category */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Category
                  </label>
                  <select
                    className="w-full border p-2 rounded bg-white"
                    value={newProduct.category}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, category: e.target.value })
                    }
                  >
                    <option>Raw Material</option> <option>Finished Good</option>
                  </select>
                </div>

                {/* 3. Price (WAS "0") */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    className="w-full border p-2 rounded"
                    placeholder="0"
                    value={newProduct.price}
                    onChange={(e) =>
                      setNewProduct({
                        ...newProduct,
                        price: Number(e.target.value),
                      })
                    }
                  />
                </div>

                {/* 4. Min Level (WAS "10") */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Alert Qty
                  </label>
                  <input
                    type="number"
                    className="w-full border p-2 rounded"
                    placeholder="10"
                    value={newProduct.minLevel}
                    onChange={(e) =>
                      setNewProduct({
                        ...newProduct,
                        minLevel: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <button className="mt-4 bg-slate-800 text-white w-full py-3 rounded-lg font-bold hover:bg-slate-900 transition">
                Add Item to Inventory
              </button>
            </form>
          </div>

          {/* GRID OF ITEMS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {products.map((p) => (
              <ProductCard key={p._id} product={p} refreshData={refreshAll} />
            ))}
          </div>

          {/* AUDIT LOG TABLE */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h2 className="font-bold text-lg mb-4 text-slate-700">
              Audit Log (History)
            </h2>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-500 sticky top-0">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Item</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {processedTransactions.map((t) => (
                    <tr key={t._id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500">
                        {new Date(t.date).toLocaleDateString()}
                      </td>
                      <td className="p-3 font-medium">{t.productName}</td>
                      <td
                        className={`p-3 font-bold ${t.type === "IN" ? "text-green-600" : "text-red-600"}`}
                      >
                        {t.type}
                      </td>
                      <td className="p-3 font-mono">{t.quantity}</td>
                      <td className="p-3 text-slate-500">{t.reason}</td>
                      <td className="p-3">
                        <button
                          onClick={() => handleDeleteTransaction(t._id)}
                          className="text-red-300 hover:text-red-600"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==========================
          TAB 3: MANUFACTURING
         ========================== */}
      {activeTab === "MANUFACTURING" && (
        <div className="flex flex-col md:flex-row gap-6 h-[80vh] max-w-6xl mx-auto">
          <div className="w-full md:w-1/3 bg-white p-4 rounded-xl shadow-sm border overflow-y-auto">
            <h2 className="font-bold mb-4 text-slate-700">
              1. Select Product to Build
            </h2>
            {finishedGoods.map((p) => (
              <div
                key={p._id}
                onClick={() => setSelectedProduct(p)}
                className={`p-3 border mb-2 rounded-lg cursor-pointer transition ${selectedProduct?._id === p._id ? "bg-blue-50 border-blue-500 ring-1 ring-blue-300" : "hover:bg-slate-50"}`}
              >
                {p.name}{" "}
                <span className="text-xs bg-slate-200 px-2 py-1 rounded float-right font-bold text-slate-600">
                  {p.quantity}
                </span>
              </div>
            ))}
          </div>
          <div className="w-full md:w-2/3 bg-white rounded-xl shadow-sm border p-6 overflow-y-auto">
            {selectedProduct ? (
              <div>
                <h2 className="font-bold text-lg mb-4 text-slate-800">
                  Recipe:{" "}
                  <span className="text-blue-600">{selectedProduct.name}</span>
                </h2>
                <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  {selectedProduct.recipe?.map((ing, i) => (
                    <div
                      key={i}
                      className="flex justify-between border-b border-slate-200 py-2 last:border-0"
                    >
                      <span>
                        {ing.qtyRequired} x {ing.ingredientName}
                      </span>
                      <button
                        onClick={() => removeFromRecipe(i)}
                        className="text-red-500 text-xs font-bold hover:bg-red-50 px-2 py-1 rounded"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                    <select
                      className="border p-2 rounded flex-1"
                      onChange={(e) =>
                        setNewIngredient({
                          ...newIngredient,
                          id: e.target.value,
                        })
                      }
                    >
                      <option value="">+ Add Ingredient</option>
                      {rawMaterials.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="border p-2 w-20 rounded"
                      value={newIngredient.qty}
                      onChange={(e) =>
                        setNewIngredient({
                          ...newIngredient,
                          qty: e.target.value,
                        })
                      }
                    />
                    <button
                      onClick={addToRecipe}
                      className="bg-slate-700 text-white px-4 rounded font-bold"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="bg-emerald-50 p-6 rounded-lg border border-emerald-200">
                  <h2 className="font-bold text-emerald-800 mb-2">
                    ⚡ Run Production
                  </h2>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Qty to build"
                      className="border border-emerald-300 p-3 rounded text-lg w-full"
                      value={buildQty}
                      onChange={(e) => setBuildQty(e.target.value)}
                    />
                    <button
                      onClick={handleManufacture}
                      className="bg-emerald-600 text-white px-6 rounded font-bold shadow-lg hover:bg-emerald-700"
                    >
                      Manufacture
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <span className="text-4xl mb-2">👈</span>
                <p>Select a product on the left</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================
          TAB 4: JOB WORK
         ========================== */}
   
      {activeTab === 'JOBWORK' && (
        <div className="max-w-4xl mx-auto">
           <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-200 mb-8">
             <h2 className="text-lg font-bold text-purple-800 mb-4 flex items-center gap-2">👷 Issue Work Order</h2>
             
             <form onSubmit={handleIssueJob} className="space-y-4">
               
               {/* NEW: JOB TYPE TOGGLE */}
               <div className="flex gap-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input type="radio" name="jobType" checked={jobForm.type === 'ASSEMBLY'} onChange={() => setJobForm({...jobForm, type: 'ASSEMBLY'})} />
                   <div>
                     <span className="font-bold text-slate-700 block">🛠️ Assembly (Make)</span>
                     <span className="text-xs text-slate-500">Give Ingredients $\rightarrow$ Get Product</span>
                   </div>
                 </label>
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input type="radio" name="jobType" checked={jobForm.type === 'SALES'} onChange={() => setJobForm({...jobForm, type: 'SALES'})} />
                   <div>
                     <span className="font-bold text-slate-700 block">🚚 Sales / Delivery</span>
                     <span className="text-xs text-slate-500">Give Finished Good $\rightarrow$ Get Money</span>
                   </div>
                 </label>
               </div>

               <div className="flex flex-col md:flex-row gap-4 items-end">
                 <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-500 uppercase mb-1">Assign To</label><input required type="text" placeholder="Name (e.g. Rahul)" className="w-full border p-2 rounded" value={jobForm.assignedTo} onChange={e => setJobForm({...jobForm, assignedTo: e.target.value})} /></div>
                 <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-500 uppercase mb-1">Product</label><select required className="w-full border p-2 rounded bg-white" value={jobForm.productId} onChange={e => setJobForm({...jobForm, productId: e.target.value})}><option value="">-- Select --</option>{finishedGoods.map(p => <option key={p._id} value={p._id}>{p.name} (Stock: {p.quantity})</option>)}</select></div>
                 <div className="w-24"><label className="text-xs font-bold text-slate-500 uppercase mb-1">Qty</label><input required type="number" placeholder="10" className="w-full border p-2 rounded" value={jobForm.quantity} onChange={e => setJobForm({...jobForm, quantity: e.target.value})} /></div>
                 <button className="bg-purple-700 text-white px-6 py-2 rounded font-bold h-[42px] w-full md:w-auto">Issue</button>
               </div>
             </form>
           </div>
           
           <h2 className="font-bold text-lg mb-4 text-slate-700">Active Jobs</h2>
           <div className="space-y-4">
             {workOrders.filter(w => w.status === 'OPEN').map(order => (
               <div key={order._id} className={`bg-white border-l-4 p-6 rounded shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 ${order.type === 'SALES' ? 'border-orange-500' : 'border-purple-500'}`}>
                 
                 <div>
                   <div className="flex items-center gap-2 mb-1">
                     <h3 className="font-bold text-lg text-slate-800">{order.assignedTo}</h3>
                     <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${order.type === 'SALES' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                       {order.type === 'SALES' ? '🚚 Delivery Run' : '🛠️ Manufacturing'}
                     </span>
                   </div>
                   <p className="text-slate-500 text-sm">
                     has <span className="font-bold text-slate-900">{order.quantity} x {order.productName}</span>
                   </p>
                 </div>

                 {/* ACTION BUTTONS */}
                 <div className="flex gap-2">
                   {order.type === 'ASSEMBLY' && (
                     <button onClick={() => handleCompleteJob(order._id)} className="bg-green-100 text-green-700 border border-green-200 px-3 py-2 rounded shadow-sm font-bold text-xs hover:bg-green-200">
                       🏢 Received Finished Goods
                     </button>
                   )}
                   
                   {/* If Sales, he can return unsold items OR deliver them */}
                   {order.type === 'SALES' && (
                     <button onClick={() => handleCompleteJob(order._id)} className="bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded shadow-sm font-bold text-xs hover:bg-slate-200">
                       ↩️ Returned Unsold
                     </button>
                   )}

                   <button onClick={() => handleDirectDelivery(order._id)} className="bg-blue-600 text-white px-3 py-2 rounded shadow-sm font-bold text-xs hover:bg-blue-700">
                     ✅ Sold / Delivered
                   </button>
                 </div>

               </div>
             ))}
           </div>
        </div>
      )}
    </div>
  );
}

export default App;
