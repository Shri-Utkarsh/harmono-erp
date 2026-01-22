import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import ProductCard from "./components/ProductCard";
import Login from './components/Login';

const API_URL = "http://localhost:5000/api";

function App() {

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState(user?.role === 'admin' ? "DASHBOARD" : "JOBWORK");
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [workers, setWorkers] = useState([]); 

  const [newProduct, setNewProduct] = useState({
    name: "", customId: "", category: "Raw Material", minLevel: 10, price: 0,
  });

  const [jobForm, setJobForm] = useState({ 
    productId: "", assignedTo: "", quantity: "", type: "ASSEMBLY", clientName: "" 
  });

  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "factory" });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [buildQty, setBuildQty] = useState("");
  const [newIngredient, setNewIngredient] = useState({ id: "", qty: 1 });

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setActiveTab('DASHBOARD'); 
  };

  const refreshAll = async () => {
    if (!user) return; 
    try {
      const promises = [
        axios.get(`${API_URL}/products`),
        axios.get(`${API_URL}/transactions`),
        axios.get(`${API_URL}/workorders`),
      ];
      if (user.role === 'admin') promises.push(axios.get(`${API_URL}/users/workers`));
      else promises.push(Promise.resolve({ data: [] }));

      const [pRes, tRes, wRes, uRes] = await Promise.all(promises);

      setProducts(pRes.data);
      setTransactions(tRes.data);
      setWorkOrders(wRes.data);
      setWorkers(uRes.data);

      if (selectedProduct) {
        const updated = pRes.data.find((p) => p._id === selectedProduct._id);
        setSelectedProduct(updated);
      }
    } catch (err) { console.error("Error fetching data", err); }
  };

  useEffect(() => {
    if (user) {
        if(user.role !== 'admin') setActiveTab('JOBWORK');
        refreshAll();
    }
  }, [user]);

  // --- HELPER: IMAGE COMPRESSION ---
  const compressImage = (file, callback) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7); 
        callback(dataUrl);
      };
    };
  };

  // --- HANDLERS ---

  const handleIssueJob = async (e) => {
    e.preventDefault();
    if (!jobForm.productId || !jobForm.assignedTo || !jobForm.quantity) return alert("Fill all fields");
    if (jobForm.type === 'SALES' && !jobForm.clientName) return alert("Please enter Customer Name");

    const workerObj = workers.find(w => w._id === jobForm.assignedTo);

    try {
      await axios.post(`${API_URL}/workorders/issue`, {
        ...jobForm,
        assignedTo: workerObj.name, 
        assignedToId: workerObj._id,
        assignedToEmpId: workerObj.employeeId 
      });
      alert(`Job assigned to ${workerObj.name}`);
      setJobForm({ productId: "", assignedTo: "", quantity: "", type: "ASSEMBLY", clientName: "" });
      refreshAll();
    } catch (err) { alert("Failed: " + (err.response?.data?.error || "Server Error")); }
  };

  const handleAssemblyComplete = async (id) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; 

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        alert("⏳ Compressing & Uploading...");
        compressImage(file, async (compressedPhoto) => {
            try {
                await axios.put(`${API_URL}/workorders/${id}/complete`, { photo: compressedPhoto });
                alert("✅ Verified!");
                refreshAll();
            } catch(err) { alert("Upload Failed: " + err.message); }
        });
    };
    alert("📸 Take a photo of the finished goods.");
    input.click();
  };

  const handleDirectDelivery = async (id) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; 

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!navigator.geolocation) return alert("GPS not supported");
        alert("📸 Photo taken! Getting Location...");
        
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            compressImage(file, async (compressedPhoto) => {
                try {
                    await axios.put(`${API_URL}/workorders/${id}/deliver`, {
                        location: { lat: latitude, lng: longitude },
                        photo: compressedPhoto
                    });
                    alert("✅ Verified!");
                    refreshAll();
                } catch(err) { alert("Upload Failed: " + err.message); }
            });
        }, () => alert("❌ GPS Denied. Please allow location."));
    };
    alert("📸 Take delivery photo.");
    input.click();
  };

  const handleAddProduct = async (e) => {
      e.preventDefault();
      await axios.post(`${API_URL}/products`, newProduct);
      alert("Added"); 
      setNewProduct({ name: "", customId: "", category: "Raw Material", minLevel: 10, price: 0 });
      refreshAll();
  }
  
  const handleAddUser = async (e) => {
      e.preventDefault();
      await axios.post(`${API_URL}/auth/register`, newUser);
      alert("User Added"); refreshAll();
  }
  
  const handleRemoveUser = async (id) => {
      if(confirm("Remove user?")) { await axios.delete(`${API_URL}/users/${id}`); refreshAll(); }
  }
  
  const handleDeleteTransaction = async (id) => {
      if(confirm("Delete log?")) { await axios.delete(`${API_URL}/transactions/${id}`); refreshAll(); }
  }
  
  const handleManufacture = async () => {
      await axios.post(`${API_URL}/manufacture`, { productId: selectedProduct._id, quantityToBuild: Number(buildQty) });
      alert("Done"); refreshAll();
  }
  
  const addToRecipe = async () => {
      const p = products.find(x => x._id === newIngredient.id);
      let r = [...(selectedProduct.recipe || [])];
      r.push({ ingredientId: p._id, ingredientName: p.name, qtyRequired: newIngredient.qty });
      await axios.put(`${API_URL}/products/${selectedProduct._id}/recipe`, { recipe: r });
      refreshAll();
  }

  const removeFromRecipe = async (index) => {
    const updated = selectedProduct.recipe.filter((_, i) => i !== index);
    try { await axios.put(`${API_URL}/products/${selectedProduct._id}/recipe`, { recipe: updated }); refreshAll(); } 
    catch (err) { alert("Failed to remove ingredient"); }
  };

  const handleCompleteJob = async (id) => {
    if (!window.confirm("Mark this job as completed?")) return;
    try { await axios.put(`${API_URL}/workorders/${id}/complete`); refreshAll(); } 
    catch (err) { alert("Error completing job"); }
  };

  // --- EXPORT 1: TRANSACTION LOG (REVENUE + RICH DATA) ---
 // --- EXPORT 1: TRANSACTION LOG (FIXED CSV FORMATTING) ---
  const handleExport = () => {
    // 1. Headers
    const headers = ["Date", "TransactionID", "Worker", "Client", "Item", "HSN", "Qty", "Value (Rs)", "Location (Map Link)", "PhotoProof?", "Reason"];
    
    const csvRows = transactions.map((t) => {
        const product = products.find(p => p.name === t.productName);
        const unitPrice = product ? product.price : 0;
        const totalValue = unitPrice * t.quantity;
        
        // Find attached Work Order
        const job = workOrders.find(w => w._id === t.workOrderId);
        
        const workerName = job ? `${job.assignedTo} (${job.assignedToEmpId})` : "-";
        const clientName = job ? (job.clientName || "-") : "-";
        const photoProof = job && job.proof?.photo ? "YES" : "NO";
        
        // FIX: Standard Google Maps URL format
        let mapLink = "-";
        if (job && job.proof?.location) {
            mapLink = `https://www.google.com/maps?q=${job.proof.location.lat},${job.proof.location.lng}`;
        }

        // 2. RETURN ROW WITH QUOTES (Prevents comma splitting)
        return [
            `"${new Date(t.date).toLocaleDateString()}"`, 
            `"${t._id}"`,
            `"${workerName}"`,
            `"${clientName}"`,
            `"${t.productName}"`,
            `"${t.productCustomId || "-"}"`,
            `"${t.quantity}"`, 
            `"${totalValue}"`,
            `"${mapLink}"`,      // <--- Quotes here fix the split issue
            `"${photoProof}"`,
            `"${t.reason}"`
        ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Transaction_Log_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click(); 
    document.body.removeChild(link);
  };

  // --- EXPORT 2: STOCK REPORT (ASSETS) ---
  const handleExportInventory = () => {
    const headers = ["Item Name", "HSN/ID", "Category", "Current Qty", "Unit Price", "Total Asset Value"];
    const csvRows = products.map((p) => {
        const totalValue = p.quantity * p.price;
        return [p.name, p.customId || "-", p.category, p.quantity, p.price, totalValue].join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + csvRows.join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Stock_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- CALCULATIONS ---
  const dashboardStats = useMemo(() => {
    const totalValue = products.reduce((acc, p) => acc + (p.quantity * (p.price || 0)), 0);
    const pendingJobs = workOrders.filter(w => {
        if (w.status !== 'PENDING') return false;
        if (user.role === 'admin') return true;
        return w.assignedToId === user.id;
    }).length;
    const totalRevenue = transactions.filter(t => t.type === 'OUT' && t.reason.startsWith('SOLD')).reduce((acc, t) => {
        const product = products.find(p => p.name === t.productName);
        return acc + (t.quantity * (product ? product.price : 0));
      }, 0);
    return { totalValue, pendingJobs, totalRevenue };
  }, [products, workOrders, transactions, user]);

  const finishedGoods = products.filter(p => p.category === "Finished Good");
  const rawMaterials = products.filter(p => p.category !== "Finished Good");
  const processedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      <header className="bg-white border-b border-purple-100 sticky top-0 z-10 p-4 shadow-sm flex justify-between items-center">
        <h1 className="text-xl font-extrabold text-purple-600">Harmono</h1>
        <div className="text-right">
             <p className="text-sm font-bold">{user.name}</p>
             <p className="text-xs text-slate-400">{user.role} | {user.employeeId || "ADMIN"}</p>
        </div>
        <button onClick={handleLogout} className="text-red-500 text-xs font-bold">Logout</button>
      </header>

      <div className="p-4 max-w-6xl mx-auto">
        <div className="flex gap-4 overflow-x-auto pb-2 mb-6 border-b">
            {user.role === 'admin' && <button onClick={() => setActiveTab('DASHBOARD')} className="font-bold text-sm">Dashboard</button>}
            {user.role === 'admin' && <button onClick={() => setActiveTab('INVENTORY')} className="font-bold text-sm">Inventory</button>}
            {user.role === 'admin' && <button onClick={() => setActiveTab('MANUFACTURING')} className="font-bold text-sm">Manufacturing</button>}
            {user.role === 'admin' && <button onClick={() => setActiveTab('TEAM')} className="font-bold text-sm">Team</button>}
            <button onClick={() => setActiveTab('JOBWORK')} className="font-bold text-sm">Jobs</button>
        </div>

        {/* DASHBOARD */}
        {activeTab === 'DASHBOARD' && user.role === 'admin' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 shadow-sm border-t-4 border-purple-500"><h3>Assets</h3><p className="text-2xl font-bold">₹{dashboardStats.totalValue.toLocaleString('en-IN')}</p></div>
                <div className="bg-white p-6 shadow-sm border-t-4 border-green-500"><h3>Revenue</h3><p className="text-2xl font-bold">₹{dashboardStats.totalRevenue.toLocaleString('en-IN')}</p></div>
                <div className="bg-white p-6 shadow-sm border-t-4 border-orange-500"><h3>Pending Jobs</h3><p className="text-2xl font-bold">{dashboardStats.pendingJobs}</p></div>
                
                {/* DUAL EXPORT BUTTONS */}
                <div className="md:col-span-3 flex justify-end gap-2">
                    <button onClick={handleExportInventory} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">📦 Stock Report (Assets)</button>
                    <button onClick={handleExport} className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700">📄 Transaction Log (Revenue)</button>
                </div>
            </div>
        )}

        {/* INVENTORY */}
        {activeTab === 'INVENTORY' && user.role === 'admin' && (
            <div>
                <div className="bg-white p-4 mb-4">
                    <h3>Add Product</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <input className="border p-2" placeholder="Name" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
                        <input className="border p-2" placeholder="HSN / ID" value={newProduct.customId} onChange={e => setNewProduct({...newProduct, customId: e.target.value})} />
                        <input className="border p-2" placeholder="Price" type="number" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
                        <input className="border p-2" placeholder="Min Qty" type="number" value={newProduct.minLevel} onChange={e => setNewProduct({...newProduct, minLevel: e.target.value})} />
                        <select className="border p-2" value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})}><option>Raw Material</option><option>Finished Good</option></select>
                        <button onClick={handleAddProduct} className="bg-blue-600 text-white p-2">Add</button>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {products.map(p => (
                        <div key={p._id} className="bg-white p-4 shadow border rounded relative">
                            <h3 className="font-bold">{p.name}</h3>
                            <p className="text-xs text-gray-500">ID: {p.customId || 'N/A'}</p>
                            <p className="text-2xl font-bold text-blue-600">{p.quantity}</p>
                            <p className="text-xs">Min: {p.minLevel}</p>
                        </div>
                    ))}
                </div>
                
                {/* AUDIT LOG */}
                <div className="bg-white p-4 shadow-sm">
                    <h3>Audit Log</h3>
                    <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 sticky top-0"><tr><th>Date</th><th>Item</th><th>HSN</th><th>Type</th><th>Qty</th><th>Reason</th><th></th></tr></thead>
                        <tbody>{processedTransactions.map(t => (
                            <tr key={t._id} className="border-b">
                                <td className="p-2 text-gray-500">{new Date(t.date).toLocaleDateString()}</td>
                                <td className="p-2 font-bold">{t.productName}</td>
                                <td className="p-2 text-xs font-mono">{t.productCustomId || '-'}</td>
                                <td className={`p-2 font-bold ${t.type==='IN'?'text-green-600':'text-red-600'}`}>{t.type}</td>
                                <td className="p-2">{t.quantity}</td>
                                <td className="p-2 text-gray-500">{t.reason}</td>
                                <td className="p-2"><button onClick={() => handleDeleteTransaction(t._id)}>🗑️</button></td>
                            </tr>
                        ))}</tbody>
                    </table>
                    </div>
                </div>
            </div>
        )}

        {/* MANUFACTURING */}
        {activeTab === 'MANUFACTURING' && user.role === 'admin' && (
           <div className="flex flex-col md:flex-row gap-6 h-[80vh] max-w-6xl mx-auto">
             <div className="w-full md:w-1/3 bg-white p-4 rounded-xl shadow-sm border overflow-y-auto">
               <h2 className="font-bold mb-4 text-slate-700">1. Select Product</h2>
               {finishedGoods.map((p) => <div key={p._id} onClick={() => setSelectedProduct(p)} className={`p-3 border mb-2 rounded-lg cursor-pointer transition ${selectedProduct?._id === p._id ? "bg-blue-50 border-blue-500 ring-1 ring-blue-300" : "hover:bg-slate-50"}`}>{p.name} <span className="text-xs bg-slate-200 px-2 py-1 rounded float-right font-bold text-slate-600">{p.quantity}</span></div>)}
             </div>
             <div className="w-full md:w-2/3 bg-white rounded-xl shadow-sm border p-6 overflow-y-auto">
               {selectedProduct ? (
                 <div>
                   <h2 className="font-bold text-lg mb-4 text-slate-800">Recipe: <span className="text-blue-600">{selectedProduct.name}</span></h2>
                   <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                     {selectedProduct.recipe?.length > 0 ? selectedProduct.recipe.map((ing, i) => <div key={i} className="flex justify-between border-b border-slate-200 py-2 last:border-0"><span>{ing.qtyRequired} x {ing.ingredientName}</span><button onClick={() => removeFromRecipe(i)} className="text-red-500 text-xs font-bold hover:bg-red-50 px-2 py-1 rounded">Remove</button></div>) : <p className="text-gray-400 italic">No recipe (Manual Mode)</p>}
                     <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                       <select className="border p-2 rounded flex-1" onChange={(e) => setNewIngredient({ ...newIngredient, id: e.target.value })}><option value="">+ Add Ingredient</option>{rawMaterials.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}</select>
                       <input type="number" className="border p-2 w-20 rounded" value={newIngredient.qty} onChange={(e) => setNewIngredient({ ...newIngredient, qty: e.target.value })} />
                       <button onClick={addToRecipe} className="bg-slate-700 text-white px-4 rounded font-bold">Add</button>
                     </div>
                   </div>
                   <div className="bg-emerald-50 p-6 rounded-lg border border-emerald-200">
                     <h2 className="font-bold text-emerald-800 mb-2">⚡ Run Production</h2>
                     <div className="flex gap-2"><input type="number" placeholder="Qty to build" className="border border-emerald-300 p-3 rounded text-lg w-full" value={buildQty} onChange={(e) => setBuildQty(e.target.value)} /><button onClick={handleManufacture} className="bg-emerald-600 text-white px-6 rounded font-bold shadow-lg hover:bg-emerald-700">Manufacture</button></div>
                   </div>
                 </div>
               ) : <div className="h-full flex flex-col items-center justify-center text-slate-400"><p>Select a product on the left</p></div>}
             </div>
           </div>
        )}

        {/* TEAM */}
        {activeTab === 'TEAM' && user.role === 'admin' && (
            <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-1/3 bg-white p-4 shadow-sm">
                    <h3>Add Member</h3>
                    <input className="border w-full mb-2 p-2" placeholder="Name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                    <input className="border w-full mb-2 p-2" placeholder="Email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                    <input className="border w-full mb-2 p-2" placeholder="Password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                    <select className="border w-full mb-2 p-2" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}><option value="factory">Factory</option><option value="delivery">Delivery</option></select>
                    <button onClick={handleAddUser} className="bg-slate-800 text-white w-full py-2">Create</button>
                </div>
                <div className="w-full md:w-2/3 bg-white p-4 shadow-sm">
                    <table className="w-full text-sm">
                        <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Action</th></tr></thead>
                        <tbody>{workers.map(w => <tr key={w._id} className="border-b"><td className="p-2 font-mono text-xs">{w.employeeId}</td><td className="p-2 font-bold">{w.name}</td><td className="p-2">{w.role}</td><td className="p-2"><button onClick={() => handleRemoveUser(w._id)} className="text-red-500">Remove</button></td></tr>)}</tbody>
                    </table>
                </div>
            </div>
        )}

        {/* JOBS */}
        {activeTab === 'JOBWORK' && (
            <div>
                {user.role === 'admin' && (
                    <div className="bg-white p-4 mb-6 shadow-sm">
                        <h3>Issue Job</h3>
                        <div className="flex gap-2 mb-2">
                            <label><input type="radio" checked={jobForm.type === 'ASSEMBLY'} onChange={() => setJobForm({...jobForm, type: 'ASSEMBLY'})} /> Assembly</label>
                            <label><input type="radio" checked={jobForm.type === 'SALES'} onChange={() => setJobForm({...jobForm, type: 'SALES'})} /> Delivery</label>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                                <select className="border p-2 flex-1" value={jobForm.assignedTo} onChange={e => setJobForm({...jobForm, assignedTo: e.target.value})}>
                                    <option value="">Select Worker</option>
                                    {workers.map(w => <option key={w._id} value={w._id}>{w.name} ({w.employeeId})</option>)}
                                </select>
                                <select className="border p-2 flex-1" value={jobForm.productId} onChange={e => setJobForm({...jobForm, productId: e.target.value})}>
                                    <option value="">Select Product</option>
                                    {finishedGoods.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                </select>
                                <input className="border p-2 w-20" type="number" value={jobForm.quantity} onChange={e => setJobForm({...jobForm, quantity: e.target.value})} />
                            </div>
                            
                            {/* CUSTOMER NAME FOR SALES */}
                            {jobForm.type === 'SALES' && (
                                <input className="border p-2 w-full bg-orange-50 border-orange-200" placeholder="Customer Name (e.g. Samsung)" value={jobForm.clientName} onChange={e => setJobForm({...jobForm, clientName: e.target.value})} />
                            )}

                            <button onClick={handleIssueJob} className="bg-purple-600 text-white p-2 w-full">Issue Job</button>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    {workOrders.map(order => (
                        (user.role === 'admin' || order.assignedToId === user.id) && (
                            <div key={order._id} className={`bg-white border-l-4 p-4 shadow-sm ${order.status === 'COMPLETED' ? 'border-green-500 opacity-80' : 'border-blue-500'}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-bold">{order.assignedTo} <span className="text-xs text-gray-400">({order.assignedToEmpId})</span></p>
                                        <p className="text-sm">{order.quantity} x {order.productName} ({order.type})</p>
                                        
                                        {/* SHOW CLIENT */}
                                        {order.clientName && <p className="text-xs font-bold text-orange-600">Client: {order.clientName}</p>}
                                        
                                        <p className="text-xs font-mono text-gray-500">HSN: {order.productCustomId || 'N/A'}</p>
                                        <p className="text-xs text-gray-500 mt-1">{order.status}</p>
                                        
                                        {/* PROOF DISPLAY */}
                                        {order.status === 'COMPLETED' && order.proof && (
                                            <div className="mt-2 text-xs bg-gray-50 p-2 border">
                                                <div className="mt-1 flex gap-2">
                                                    {order.proof.location && <a target="_blank" href={`https://www.google.com/maps?q=${order.proof.location.lat},${order.proof.location.lng}`} className="text-blue-500 underline">📍 Map</a>}
                                                    {order.proof.photo && <button onClick={() => {const w=window.open(""); w.document.write(`<img src="${order.proof.photo}" width="100%"/>`)}} className="text-purple-500 underline">📸 Photo</button>}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* BUTTONS */}
                                    {order.status === 'PENDING' && (user.id === order.assignedToId || user.role === 'admin') && (
                                        <button 
                                            onClick={() => order.type === 'SALES' ? handleDirectDelivery(order._id) : handleAssemblyComplete(order._id)}
                                            className="bg-blue-600 text-white px-4 py-2 text-sm font-bold rounded"
                                        >
                                            {order.type === 'SALES' ? '📸 Deliver' : '📸 Build'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    ))}
                    {workOrders.length === 0 && <p className="text-center text-gray-400">No jobs</p>}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

export default App;