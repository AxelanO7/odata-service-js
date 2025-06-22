const express = require("express");
const cors = require("cors");
const path = require("path");
const xlsx = require("xlsx");

const app = express();
const port = process.env.PORT || 3000;

console.log("Memulai inisialisasi server...");

app.use(cors());
app.use(express.json());

// --- Variabel Global untuk Data ---
let products = [];
let categories = [];
let sales = [];

// --- Fungsi Pemuatan Data ---
const loadXLSXData = (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath, {
      cellDates: true,
      codepage: 65001,
    });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
  } catch (error) {
    console.error(`Gagal membaca file Excel: ${filePath}`, error);
    throw error;
  }
};

const initializeData = () => {
  try {
    console.log("Memulai pemuatan data dari file Excel...");
    const gudangFilePath = path.join(__dirname, "data", "data_gudang.xlsx");
    const penjualanFilePath = path.join(
      __dirname,
      "data",
      "data_penjualan.xlsx"
    );

    // 1. Muat data gudang
    const gudangData = loadXLSXData(gudangFilePath);
    if (!gudangData.length)
      throw new Error("Data Gudang kosong atau gagal dibaca.");

    products = gudangData
      .map((item) => {
        const namaBarang = item[" Nama Barang "]
          ? String(item[" Nama Barang "]).trim()
          : "Nama Tidak Tersedia";
        return {
          id: parseInt(item[" No "], 10),
          name: namaBarang,
          price: parseFloat(item[" Harga Barang  "]),
          category: "Umum",
          description: namaBarang,
          stock: parseInt(item[" Jumlah Stok "], 10),
          createdDate: new Date().toISOString(),
        };
      })
      .filter((p) => p.id && !isNaN(p.id));
    console.log(`${products.length} produk berhasil dimuat.`);

    // 2. Buat kategori dinamis
    const categoryNames = [
      ...new Set(products.map((p) => p.category).filter(Boolean)),
    ];
    categories = categoryNames.map((name, index) => ({
      id: index + 1,
      name: name,
      description: `Kategori untuk ${name}`,
    }));
    console.log(`${categories.length} kategori berhasil dibuat.`);

    // 3. Muat data penjualan
    const penjualanData = loadXLSXData(penjualanFilePath);
    if (!penjualanData.length)
      throw new Error("Data Penjualan kosong atau gagal dibaca.");

    sales = penjualanData
      .map((item, index) => {
        const saleDate =
          item[" TGL "] instanceof Date ? item[" TGL "].toISOString() : null;
        const productName = item[" NAMA "] ? String(item[" NAMA "]).trim() : "";
        const relatedProduct = products.find((p) => p.name === productName);
        return {
          id: index + 1,
          productId: relatedProduct ? relatedProduct.id : null,
          productName: productName,
          quantity: parseInt(item[" JBL "], 10),
          totalPrice: parseFloat(item[" JUAL "]),
          saleDate: saleDate,
        };
      })
      .filter((s) => s.productName);
    console.log(`${sales.length} data penjualan berhasil dimuat.`);
    console.log("Inisialisasi data selesai.");
  } catch (error) {
    console.error("KRITIS: Gagal total menginisialisasi data.", error);
  }
};

// --- Middleware & Routes ---
const odataHeaders = (req, res, next) => {
  res.set({
    "OData-Version": "4.0",
    "Content-Type": "application/json;odata.metadata=minimal",
  });
  next();
};

// Memanggil inisialisasi data sekali saat server dimulai
initializeData();
console.log("Mendaftarkan OData routes...");

// Service Document
app.get("/", odataHeaders, (req, res) => {
  res.json({
    "@odata.context": "$metadata",
    value: [
      { name: "Products", kind: "EntitySet", url: "Products" },
      { name: "Categories", kind: "EntitySet", url: "Categories" },
      { name: "Sales", kind: "EntitySet", url: "Sales" },
    ],
  });
});

// Metadata Document
app.get("/$metadata", (req, res) => {
  const metadata = `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="MyService" xmlns="http://docs.oasis-open.org/odata/ns/edm"><EntityType Name="Product"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="name" Type="Edm.String"/><Property Name="price" Type="Edm.Decimal"/><Property Name="category" Type="Edm.String"/><Property Name="description" Type="Edm.String"/><Property Name="stock" Type="Edm.Int32"/><Property Name="createdDate" Type="Edm.DateTimeOffset" Nullable="true"/></EntityType><EntityType Name="Category"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="name" Type="Edm.String"/><Property Name="description" Type="Edm.String"/></EntityType><EntityType Name="Sale"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="productId" Type="Edm.Int32" Nullable="true"/><Property Name="productName" Type="Edm.String"/><Property Name="quantity" Type="Edm.Int32"/><Property Name="totalPrice" Type="Edm.Decimal"/><Property Name="saleDate" Type="Edm.DateTimeOffset" Nullable="true"/><NavigationProperty Name="Product" Type="MyService.Product" Nullable="true"><ReferentialConstraint Property="productId" ReferencedProperty="id"/></NavigationProperty></EntityType><EntityContainer Name="Container"><EntitySet Name="Products" EntityType="MyService.Product"/><EntitySet Name="Categories" EntityType="MyService.Category"/><EntitySet Name="Sales" EntityType="MyService.Sale"><NavigationPropertyBinding Path="Product" Target="Products"/></EntitySet></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
  res.set({ "Content-Type": "application/xml", "OData-Version": "4.0" });
  res.send(metadata);
});

// Helper functions and other endpoints... (Diringkas, tapi fungsionalitasnya sama)
function parseODataQuery(query) {
  const o = {};
  if (query.$filter) o.filter = query.$filter;
  if (query.$select) o.select = query.$select.split(",").map((e) => e.trim());
  if (query.$orderby) o.orderby = query.$orderby;
  if (query.$top) o.top = parseInt(query.$top, 10);
  if (query.$skip) o.skip = parseInt(query.$skip, 10);
  if (query.$count) o.count = query.$count === "true";
  if (query.$expand) o.expand = query.$expand.split(",").map((e) => e.trim());
  return o;
}
function applyFilter(data, filter) {
  if (!filter) return data;
  return data.filter((item) => {
    if (filter.includes(" eq ")) {
      const [field, value] = filter.split(" eq ").map((s) => s.trim());
      const cleanValue = value.replace(/'/g, "");
      if (item[field] === null || item[field] === undefined) return false;
      return item[field].toString() == cleanValue;
    }
    return true;
  });
}
function applyOrderBy(data, orderby) {
  if (!orderby) return data;
  const [field, direction] = orderby.split(" ");
  const desc = direction && direction.toLowerCase() === "desc";
  return data.sort((a, b) => {
    if (a[field] === null) return 1;
    if (b[field] === null) return -1;
    if (a[field] < b[field]) return desc ? 1 : -1;
    if (a[field] > b[field]) return desc ? -1 : 1;
    return 0;
  });
}
function applyExpand(data, expand) {
  if (!expand || !data || !expand.includes("Product")) return data;
  return data.map((sale) => ({
    ...sale,
    Product: products.find((p) => p.id === sale.productId) || null,
  }));
}
app.get("/Sales", odataHeaders, (req, res) => {
  const options = parseODataQuery(req.query);
  let result = [...sales];
  result = applyFilter(result, options.filter);
  result = applyOrderBy(result, options.orderby);
  const totalCount = result.length;
  if (options.skip) result = result.slice(options.skip);
  if (options.top) result = result.slice(0, options.top);
  result = applyExpand(result, options.expand);
  res.json({
    "@odata.context": "$metadata#Sales",
    value: result,
    "@odata.count": totalCount,
  });
});
app.get("/Products", odataHeaders, (req, res) => {
  const options = parseODataQuery(req.query);
  let result = [...products];
  result = applyFilter(result, options.filter);
  result = applyOrderBy(result, options.orderby);
  const totalCount = result.length;
  if (options.skip) result = result.slice(options.skip);
  if (options.top) result = result.slice(0, options.top);
  res.json({
    "@odata.context": "$metadata#Products",
    value: result,
    "@odata.count": totalCount,
  });
});
app.get("/Categories", odataHeaders, (req, res) => {
  res.json({ "@odata.context": "$metadata#Categories", value: categories });
});
app.get("/Sales\\(:id\\)", odataHeaders, (req, res) => {
  const id = parseInt(req.params.id, 10);
  let sale = sales.find((s) => s.id === id);
  if (!sale) return res.status(404).json({ error: "Not Found" });
  const options = parseODataQuery(req.query);
  sale = applyExpand([sale], options.expand)[0];
  res.json({ "@odata.context": "../$metadata#Sales/$entity", ...sale });
});
app.get("/Products\\(:id\\)", odataHeaders, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = products.find((p) => p.id === id);
  if (!product) return res.status(404).json({ error: "Not Found" });
  res.json({ "@odata.context": "../$metadata#Products/$entity", ...product });
});
app.get("/Categories\\(:id\\)", odataHeaders, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const category = categories.find((c) => c.id === id);
  if (!category) return res.status(404).json({ error: "Not Found" });
  res.json({
    "@odata.context": "../$metadata#Categories/$entity",
    ...category,
  });
});

console.log("Semua route telah terdaftar.");

// Jalankan server HANYA untuk development lokal
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server LOKAL berjalan di http://localhost:${port}`);
  });
}

// Export 'app' untuk Vercel
module.exports = app;
