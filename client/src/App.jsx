import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import ProductCard from "./components/ProductCard";
import Login from './components/Login';

// Define API Base URL
const API_URL = "http://localhost:5000/api";

function App() {

  // --- 1. AUTHENTICATION STATE ---
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  // --- 2. APP STATE ---
  const [activeTab, setActiveTab] = useState("DASHBOARD");
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [workers, setWorkers] = useState([]); 

  // --- 3. FORMS & INPUTS ---
  const [newProduct, setNewProduct] = useState({
    name: "", category: "Raw Material", minLevel: 10, price: 0,
  });

  const [jobForm, setJobForm] = useState({ 
    productId: "", assignedTo: "", quantity: "", type: "ASSEMBLY" 
  });

  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "factory" });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [buildQty, setBuildQty] = useState("");
  const [newIngredient, setNewIngredient] = useState({ id: "", qty: 1 });

  // --- 4. LOGOUT FUNCTION ---
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setActiveTab('DASHBOARD'); 
  };

  // --- 5. API CALLS ---
  const refreshAll = async () => {
    if (!user) return; 

    try {
      const promises = [
        axios.get(`${API_URL}/products`),
        axios.get(`${API_URL}/transactions`),
        axios.get(`${API_URL}/workorders`),
      ];

      if (user.role === 'admin') {
        promises.push(axios.get(`${API_URL}/users/workers`));
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      const [pRes, tRes, wRes, uRes] = await Promise.all(promises);

      setProducts(pRes.data);
      setTransactions(tRes.data);
      setWorkOrders(wRes.data);
      setWorkers(uRes.data);

      if (selectedProduct) {
        const updated = pRes.data.find((p) => p._id === selectedProduct._id);
        setSelectedProduct(updated);
      }
    } catch (err) {
      console.error("Error fetching data", err);
    }
  };

  useEffect(() => {
    if (user) refreshAll();
  }, [user]);

  // --- 6. EVENT HANDLERS ---

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name) return;
    try {
      await axios.post(`${API_URL}/products`, newProduct);
      alert("✅ Item Added Successfully!");
      setNewProduct({ name: "", category: "Raw Material", minLevel: 10, price: 0 });
      refreshAll();
    } catch (err) { alert("Error adding product"); }
  };

  const handleIssueJob = async (e) => {
    e.preventDefault();
    if (!jobForm.productId || !jobForm.assignedTo || !jobForm.quantity) return alert("Fill all fields");

    const workerObj = workers.find(w => w._id === jobForm.assignedTo);
    if (!workerObj) return alert("Invalid Worker Selected");

    try {
      await axios.post(`${API_URL}/workorders/issue`, {
        ...jobForm,
        assignedTo: workerObj.name, 
        assignedToId: workerObj._id 
      });
      alert(`Job assigned to ${workerObj.name}`);
      setJobForm({ ...jobForm, quantity: "" });
      refreshAll();
    } catch (err) { alert("Failed: " + err.response?.data?.error); }
  };

  const handleCompleteJob = async (id) => {
    if (!window.confirm("Mark this job as completed?")) return;
    try { await axios.put(`${API_URL}/workorders/${id}/complete`); refreshAll(); } 
    catch (err) { alert("Error completing job"); }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm("Delete this log?")) return;
    try { await axios.delete(`${API_URL}/transactions/${id}`); refreshAll(); } 
    catch (err) { alert("Failed to delete"); }
  };

  const handleDirectDelivery = async (id) => {
    const clientName = prompt("To whom was the product delivered?");
    if (!clientName) return; 
    try { await axios.put(`${API_URL}/workorders/${id}/deliver`, { clientName }); alert("✅ Delivery Recorded!"); refreshAll(); } 
    catch (err) { alert("Error: " + err.response?.data?.error); }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try { await axios.post(`${API_URL}/auth/register`, newUser); alert("✅ Member Added!"); setNewUser({ name: "", email: "", password: "", role: "factory" }); refreshAll(); } 
    catch (err) { alert("Error: " + err.response?.data?.error); }
  };

  const handleRemoveUser = async (id) => {
    if (!window.confirm("Remove this employee?")) return;
    try { await axios.delete(`${API_URL}/users/${id}`); refreshAll(); } 
    catch (err) { alert("Failed to remove user"); }
  };

  const addToRecipe = async () => {
    if (!selectedProduct || !newIngredient.id) return;
    const ingredientObj = products.find((p) => p._id === newIngredient.id);
    let updatedRecipe = [...(selectedProduct.recipe || [])];
    const existingIndex = updatedRecipe.findIndex((item) => item.ingredientId === newIngredient.id);
    
    if (existingIndex >= 0) {
      updatedRecipe[existingIndex].qtyRequired = Number(updatedRecipe[existingIndex].qtyRequired) + Number(newIngredient.qty);
    } else {
      updatedRecipe.push({ ingredientId: newIngredient.id, ingredientName: ingredientObj.name, qtyRequired: Number(newIngredient.qty) });
    }

    try { await axios.put(`${API_URL}/products/${selectedProduct._id}/recipe`, { recipe: updatedRecipe }); refreshAll(); setNewIngredient({ ...newIngredient, id: "" }); } 
    catch (err) { alert("Failed to update recipe"); }
  };

  const removeFromRecipe = async (index) => {
    const updated = selectedProduct.recipe.filter((_, i) => i !== index);
    try { await axios.put(`${API_URL}/products/${selectedProduct._id}/recipe`, { recipe: updated }); refreshAll(); } 
    catch (err) { alert("Failed to remove ingredient"); }
  };

  const handleManufacture = async () => {
    if (!buildQty) return;
    try { await axios.post(`${API_URL}/manufacture`, { productId: selectedProduct._id, quantityToBuild: Number(buildQty) }); alert("Production Successful!"); setBuildQty(""); refreshAll(); } 
    catch (err) { alert("Failed: " + err.response?.data?.error); }
  };

  const handleExport = () => {
    const headers = ["Date", "Item Name", "Type", "Quantity", "Reason / Vendor", "Transaction ID"];
    const csvRows = transactions.map((t) => [new Date(t.date).toLocaleDateString(), t.productName, t.type, t.quantity, `"${t.reason}"`, t._id].join(","));
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Harmono_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click(); document.body.removeChild(link);
  };

  // --- 7. CALCULATIONS & FILTERING ---
  const dashboardStats = useMemo(() => {
    const totalValue = products.reduce((acc, p) => acc + (p.quantity * (p.price || 0)), 0);
    const lowStockCount = products.filter(p => p.quantity < p.minLevel).length;
    
    // FIX: Only count my jobs if I am not Admin
    const pendingJobs = workOrders.filter(w => {
      if (w.status !== 'PENDING') return false;
      if (user.role === 'admin') return true;
      return w.assignedToId === user.id;
    }).length;

    const totalRevenue = transactions
      .filter(t => t.type === 'OUT' && t.reason.startsWith('SOLD')) 
      .reduce((acc, t) => {
        const product = products.find(p => p.name === t.productName);
        const price = product ? product.price : 0;
        return acc + (t.quantity * price);
      }, 0);

    return { totalValue, lowStockCount, pendingJobs, totalRevenue };
  }, [products, workOrders, transactions, user]);

  const finishedGoods = products.filter((p) => p.category === "Finished Good");
  const rawMaterials = products.filter((p) => p.category !== "Finished Good");
  const processedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  // --- 8. RENDER ---

  if (!user) return <Login onLogin={(userData) => setUser(userData)} />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      
      {/* HEADER */}
      <header className="bg-white border-b border-purple-100 sticky top-0 z-10 p-4 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold">H</div>
           <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-500">Harmono</h1>
        </div>
        <div className="flex items-center gap-4">
           <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-slate-700">{user.name}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{user.role}</p>
           </div>
           <button onClick={handleLogout} className="bg-red-50 text-red-600 px-3 py-1 rounded text-xs font-bold hover:bg-red-100">Logout</button>
        </div>
      </header>

      {/* TABS */}
      <div className="p-4 max-w-6xl mx-auto">
        <div className="flex gap-4 overflow-x-auto pb-2 mb-6 border-b border-slate-200">
          <button onClick={() => setActiveTab('DASHBOARD')} className={`pb-2 px-2 text-sm font-bold ${activeTab === 'DASHBOARD' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-400'}`}>Dashboard</button>
          
          {user.role === 'admin' && (
            <>
              <button onClick={() => setActiveTab('INVENTORY')} className={`pb-2 px-2 text-sm font-bold ${activeTab === 'INVENTORY' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-400'}`}>Inventory</button>
              <button onClick={() => setActiveTab('MANUFACTURING')} className={`pb-2 px-2 text-sm font-bold ${activeTab === 'MANUFACTURING' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-400'}`}>Manufacturing</button>
              <button onClick={() => setActiveTab('TEAM')} className={`pb-2 px-2 text-sm font-bold ${activeTab === 'TEAM' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-400'}`}>Team</button>
            </>
          )}

          <button onClick={() => setActiveTab('JOBWORK')} className={`pb-2 px-2 text-sm font-bold ${activeTab === 'JOBWORK' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-slate-400'}`}>Job Work</button>
        </div>

        {/* === TAB 1: DASHBOARD === */}
        {activeTab === 'DASHBOARD' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {user.role === 'admin' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
                  <h3 className="text-xs font-bold text-slate-400 uppercase">Total Assets</h3>
                  <p className="text-2xl font-extrabold text-slate-700">₹ {dashboardStats.totalValue.toLocaleString('en-IN')}</p>
                </div>
              )}
              {user.role === 'admin' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
                  <h3 className="text-xs font-bold text-slate-400 uppercase">Revenue</h3>
                  <p className="text-2xl font-extrabold text-green-600">₹ {dashboardStats.totalRevenue.toLocaleString('en-IN')}</p>
                </div>
              )}
              <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-orange-500">
                 <h3 className="text-xs font-bold text-slate-400 uppercase">{user.role === 'admin' ? 'Total Pending Jobs' : 'My Pending Jobs'}</h3>
                 <p className="text-2xl font-extrabold text-slate-700">{dashboardStats.pendingJobs}</p>
              </div>
            </div>
            {user.role === 'admin' && (
              <div className="flex justify-end mb-4">
                <button onClick={handleExport} className="bg-green-600 text-white px-6 py-2 rounded shadow-sm hover:bg-green-700 font-bold flex items-center gap-2">📄 Download Excel Report</button>
              </div>
            )}
          </div>
        )}

        {/* === TAB 2: INVENTORY === */}
        {activeTab === 'INVENTORY' && user.role === 'admin' && (
           <div className="max-w-6xl mx-auto">
             <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 mb-8">
               <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2"><span className="bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">＋</span> Add New Item</h2>
               <form onSubmit={handleAddProduct}>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                   <div className="lg:col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Item Name</label><input type="text" className="w-full border p-2 rounded" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} /></div>
                   <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label><select className="w-full border p-2 rounded bg-white" value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}><option>Raw Material</option> <option>Finished Good</option></select></div>
                   <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Price (₹)</label><input type="number" className="w-full border p-2 rounded" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })} /></div>
                   <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Alert Qty</label><input type="number" className="w-full border p-2 rounded" value={newProduct.minLevel} onChange={(e) => setNewProduct({ ...newProduct, minLevel: Number(e.target.value) })} /></div>
                 </div>
                 <button className="mt-4 bg-slate-800 text-white w-full py-3 rounded-lg font-bold hover:bg-slate-900 transition">Add Item</button>
               </form>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
               {products.map((p) => <ProductCard key={p._id} product={p} refreshData={refreshAll} />)}
             </div>
             <div className="bg-white rounded-xl shadow-sm border p-4">
                <h2 className="font-bold text-lg mb-4 text-slate-700">Audit Log</h2>
                <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-500 sticky top-0"><tr><th className="p-3">Date</th><th className="p-3">Item</th><th className="p-3">Type</th><th className="p-3">Qty</th><th className="p-3">Reason</th><th className="p-3"></th></tr></thead>
                    <tbody className="divide-y">{processedTransactions.map((t) => (<tr key={t._id} className="hover:bg-slate-50"><td className="p-3 text-slate-500">{new Date(t.date).toLocaleDateString()}</td><td className="p-3 font-medium">{t.productName}</td><td className={`p-3 font-bold ${t.type === "IN" ? "text-green-600" : "text-red-600"}`}>{t.type}</td><td className="p-3 font-mono">{t.quantity}</td><td className="p-3 text-slate-500">{t.reason}</td><td className="p-3"><button onClick={() => handleDeleteTransaction(t._id)} className="text-red-300 hover:text-red-600">🗑️</button></td></tr>))}</tbody>
                    </table>
                </div>
             </div>
           </div>
        )}

        {/* === TAB 3: MANUFACTURING === */}
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
                     {selectedProduct.recipe?.map((ing, i) => <div key={i} className="flex justify-between border-b border-slate-200 py-2 last:border-0"><span>{ing.qtyRequired} x {ing.ingredientName}</span><button onClick={() => removeFromRecipe(i)} className="text-red-500 text-xs font-bold hover:bg-red-50 px-2 py-1 rounded">Remove</button></div>)}
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

        {/* === TAB 5: TEAM MANAGEMENT (Admin Only) === */}
        {activeTab === 'TEAM' && user.role === 'admin' && (
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
            {/* ADD MEMBER */}
            <div className="w-full md:w-1/3">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-700 mb-4">Add New Member</h2>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label><input type="text" required className="w-full border p-2 rounded" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label><input type="email" required className="w-full border p-2 rounded" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label><input type="text" required className="w-full border p-2 rounded" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role</label><select className="w-full border p-2 rounded bg-white" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}><option value="factory">🏭 Factory Worker</option><option value="delivery">🚚 Delivery Agent</option><option value="admin">👑 Admin</option></select></div>
                  <button className="w-full bg-slate-800 text-white py-2 rounded font-bold hover:bg-slate-900">Create Account</button>
                </form>
              </div>
            </div>
            {/* LIST MEMBERS */}
            <div className="w-full md:w-2/3">
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-200"><h2 className="font-bold text-slate-700">All Employees ({workers.length})</h2></div>
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-slate-500"><tr><th className="p-4">Name</th><th className="p-4">Role</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {workers.map(worker => {
                      const activeJob = workOrders.find(w => w.assignedToId === worker._id && w.status === 'PENDING');
                      return (
                        <tr key={worker._id} className="hover:bg-slate-50">
                          <td className="p-4 font-bold text-slate-700">{worker.name}</td>
                          <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${worker.role === 'factory' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{worker.role}</span></td>
                          <td className="p-4">{activeJob ? <div className="text-red-600 font-bold flex items-center gap-1 text-xs">🔴 Busy ({activeJob.productName})</div> : <div className="text-green-600 font-bold flex items-center gap-1 text-xs">🟢 Free</div>}</td>
                          <td className="p-4 text-right"><button onClick={() => handleRemoveUser(worker._id)} className="text-red-400 hover:text-red-600 font-bold text-xs border border-red-200 px-3 py-1 rounded hover:bg-red-50">Remove</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* === TAB 4: JOB WORK === */}
        {activeTab === 'JOBWORK' && (
           <div className="max-w-4xl mx-auto">
             {user.role === 'admin' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-200 mb-8">
                <h2 className="text-lg font-bold text-purple-800 mb-4 flex items-center gap-2">👷 Issue Work Order</h2>
                <form onSubmit={handleIssueJob} className="space-y-4">
                    <div className="flex gap-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
                      <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="jobType" checked={jobForm.type === 'ASSEMBLY'} onChange={() => setJobForm({...jobForm, type: 'ASSEMBLY'})} /><div><span className="font-bold text-slate-700 block">🛠️ Assembly</span></div></label>
                      <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="jobType" checked={jobForm.type === 'SALES'} onChange={() => setJobForm({...jobForm, type: 'SALES'})} /><div><span className="font-bold text-slate-700 block">🚚 Delivery</span></div></label>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-500 uppercase mb-1">Assign To</label><select required className="w-full border p-2 rounded bg-white" value={jobForm.assignedTo} onChange={e => setJobForm({...jobForm, assignedTo: e.target.value})}><option value="">-- Select Worker --</option>{workers.map(w => <option key={w._id} value={w._id}>{w.name} ({w.role})</option>)}</select></div>
                      <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-500 uppercase mb-1">Product</label><select required className="w-full border p-2 rounded bg-white" value={jobForm.productId} onChange={e => setJobForm({...jobForm, productId: e.target.value})}><option value="">-- Select --</option>{finishedGoods.map(p => <option key={p._id} value={p._id}>{p.name} ({p.quantity})</option>)}</select></div>
                      <div className="w-24"><label className="text-xs font-bold text-slate-500 uppercase mb-1">Qty</label><input required type="number" placeholder="10" className="w-full border p-2 rounded" value={jobForm.quantity} onChange={e => setJobForm({...jobForm, quantity: e.target.value})} /></div>
                      <button className="bg-purple-700 text-white px-6 py-2 rounded font-bold h-[42px] w-full md:w-auto">Issue</button>
                    </div>
                </form>
                </div>
             )}
             
             <h2 className="font-bold text-lg mb-4 text-slate-700">Active Jobs</h2>
             <div className="space-y-4">
               {workOrders.map(order => (
                 (user.role === 'admin' || order.assignedToId === user.id) && (
                  <div key={order._id} className={`bg-white border-l-4 p-6 rounded shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 ${order.status === 'COMPLETED' ? 'border-green-500 opacity-75' : 'border-purple-500'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg text-slate-800">{order.assignedTo}</h3>
                        {order.status === 'PENDING' ? <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">⏳ Pending</span> : <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">✅ Done</span>}
                      </div>
                      <p className="text-slate-500 text-sm">Task: <span className="font-bold text-slate-900">{order.quantity} x {order.productName}</span> ({order.type})</p>
                      <div className="text-xs text-slate-400 mt-2 flex gap-4"><p>📅 Assigned: {new Date(order.assignedAt).toLocaleDateString()}</p>{order.completedAt && <p>🏁 Completed: {new Date(order.completedAt).toLocaleDateString()}</p>}</div>
                    </div>
                    <div className="flex gap-2">
                      {order.status === 'PENDING' && (user.id === order.assignedToId || user.role === 'admin') && (<button onClick={() => order.type === 'SALES' ? handleDirectDelivery(order._id) : handleCompleteJob(order._id)} className="bg-blue-600 text-white px-4 py-2 rounded shadow-sm font-bold text-sm hover:bg-blue-700">Mark as Done</button>)}
                      {order.status === 'COMPLETED' && <span className="text-green-600 font-bold text-sm flex items-center gap-1"><span>✔ Verified</span></span>}
                    </div>
                  </div>
                 )
               ))}
               {workOrders.length === 0 && <p className="text-center text-slate-400 italic py-8">No jobs found.</p>}
             </div>
           </div>
        )}

      </div>
    </div>
  );
}

export default App;