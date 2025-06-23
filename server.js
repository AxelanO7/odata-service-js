const express = require("express");
const cors = require("cors");
const path = require("path");
const xlsx = require("xlsx");

const app = express();
const port = process.env.PORT || 3000;

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
          costPrice: parseFloat(item[" POKOK "]),
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

initializeData();
console.log("Mendaftarkan semua routes...");

// OData Endpoints
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
app.get("/$metadata", (req, res) => {
  const metadata = `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="MyService" xmlns="http://docs.oasis-open.org/odata/ns/edm"><EntityType Name="Product"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="name" Type="Edm.String"/><Property Name="price" Type="Edm.Decimal"/><Property Name="category" Type="Edm.String"/><Property Name="description" Type="Edm.String"/><Property Name="stock" Type="Edm.Int32"/><Property Name="createdDate" Type="Edm.DateTimeOffset" Nullable="true"/></EntityType><EntityType Name="Category"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="name" Type="Edm.String"/><Property Name="description" Type="Edm.String"/></EntityType><EntityType Name="Sale"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="productId" Type="Edm.Int32" Nullable="true"/><Property Name="productName" Type="Edm.String"/><Property Name="quantity" Type="Edm.Int32"/><Property Name="totalPrice" Type="Edm.Decimal"/><Property Name="saleDate" Type="Edm.DateTimeOffset" Nullable="true"/><NavigationProperty Name="Product" Type="MyService.Product" Nullable="true"><ReferentialConstraint Property="productId" ReferencedProperty="id"/></NavigationProperty></EntityType><EntityContainer Name="Container"><EntitySet Name="Products" EntityType="MyService.Product"/><EntitySet Name="Categories" EntityType="MyService.Category"/><EntitySet Name="Sales" EntityType="MyService.Sale"><NavigationPropertyBinding Path="Product" Target="Products"/></EntitySet></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
  res.set({ "Content-Type": "application/xml", "OData-Version": "4.0" });
  res.send(metadata);
});
app.get("/Products", odataHeaders, (req, res) => {
  res.json({ "@odata.context": "$metadata#Products", value: products });
});
app.get("/Sales", odataHeaders, (req, res) => {
  res.json({ "@odata.context": "$metadata#Sales", value: sales });
});
app.get("/Categories", odataHeaders, (req, res) => {
  res.json({ "@odata.context": "$metadata#Categories", value: categories });
});
// ...dan seterusnya untuk semua endpoint OData lainnya.

// =====================================================================
// ENDPOINT CSV UNTUK GOOGLE SHEETS (YANG SEBELUMNYA HILANG)
// =====================================================================
function convertToCSV(data) {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map(
          (fieldName) =>
            `"${String(row[fieldName] === null ? "" : row[fieldName]).replace(
              /"/g,
              '""'
            )}"`
        )
        .join(",")
    ),
  ];
  return csvRows.join("\n");
}

app.get("/products.csv", (req, res) => {
  const csvData = convertToCSV(products);
  res.header("Content-Type", "text/csv");
  res.send(csvData);
});

app.get("/sales.csv", (req, res) => {
  // Kita gabungkan dengan info produk agar lebih berguna di sheet
  const expandedSales = sales.map((sale) => {
    const product = products.find((p) => p.id === sale.productId);
    return {
      ...sale,
      productName_from_gudang: product ? product.name : "N/A",
      productCategory_from_gudang: product ? product.category : "N/A",
    };
  });
  const csvData = convertToCSV(expandedSales);
  res.header("Content-Type", "text/csv");
  res.send(csvData);
});

console.log("Semua route, termasuk CSV, telah terdaftar.");

// Jalankan server HANYA untuk development lokal
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server LOKAL berjalan di http://localhost:${port}`);
  });
}

// Export 'app' untuk Vercel
module.exports = app;
