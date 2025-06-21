const express = require("express");
const cors = require("cors");
const path = require("path");
const xlsx = require("xlsx");

const app = express();
const port = process.env.PORT || 3000; // Gunakan port dari environment

app.use(cors());
app.use(express.json());

// --- DATA LOADING (BAGIAN UTAMA PERUBAHAN) ---
let products = [];
let categories = [];
let sales = [];

// Fungsi untuk memuat data dari file .xlsx (TETAP SAMA)
const loadXLSXData = (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
  } catch (error) {
    console.error(`Gagal membaca file Excel: ${filePath}`, error);
    throw error; // Lemparkan error agar bisa ditangkap
  }
};

// Fungsi inisialisasi data yang sekarang bersifat sinkron (tanpa async/await)
const initializeData = () => {
  try {
    const gudangFilePath = path.join(__dirname, "data", "data_gudang.xlsx");
    const penjualanFilePath = path.join(
      __dirname,
      "data",
      "data_penjualan.xlsx"
    );

    // 1. Muat data gudang
    const gudangData = loadXLSXData(gudangFilePath);
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
  } catch (error) {
    console.error(
      "KRITIS: Gagal total menginisialisasi data saat startup.",
      error
    );
    // Di lingkungan produksi, penting untuk tahu jika data gagal dimuat
  }
};

// =====================================================================
// PANGGIL FUNGSI INISIALISASI DATA DI SINI (SATU KALI SAJA)
initializeData();
// =====================================================================

// --- ODATA ENDPOINTS ---
// (Tidak ada perubahan sama sekali pada semua fungsi endpoint di bawah ini)

// OData Service Document
app.get("/", (req, res) => {
  // ... (kode sama seperti sebelumnya)
  const serviceDocument = {
    "@odata.context": `${req.protocol}://${req.get("host")}/$metadata`,
    value: [
      { name: "Products", kind: "EntitySet", url: "Products" },
      { name: "Categories", kind: "EntitySet", url: "Categories" },
      { name: "Sales", kind: "EntitySet", url: "Sales" },
    ],
  };
  res.json(serviceDocument);
});

// OData Metadata Document
app.get("/$metadata", (req, res) => {
  // ... (kode sama seperti sebelumnya)
  const metadata = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="MyService" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Product"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="name" Type="Edm.String"/><Property Name="price" Type="Edm.Decimal"/><Property Name="category" Type="Edm.String"/><Property Name="description" Type="Edm.String"/><Property Name="stock" Type="Edm.Int32"/><Property Name="createdDate" Type="Edm.DateTimeOffset" Nullable="true"/></EntityType>
      <EntityType Name="Category"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="name" Type="Edm.String"/><Property Name="description" Type="Edm.String"/></EntityType>
      <EntityType Name="Sale"><Key><PropertyRef Name="id"/></Key><Property Name="id" Type="Edm.Int32" Nullable="false"/><Property Name="productId" Type="Edm.Int32" Nullable="true"/><Property Name="productName" Type="Edm.String"/><Property Name="quantity" Type="Edm.Int32"/><Property Name="totalPrice" Type="Edm.Decimal"/><Property Name="saleDate" Type="Edm.DateTimeOffset" Nullable="true"/><NavigationProperty Name="Product" Type="MyService.Product" Nullable="true"><ReferentialConstraint Property="productId" ReferencedProperty="id"/></NavigationProperty></EntityType>
      <EntityContainer Name="Container"><EntitySet Name="Products" EntityType="MyService.Product"/><EntitySet Name="Categories" EntityType="MyService.Category"/><EntitySet Name="Sales" EntityType="MyService.Sale"><NavigationPropertyBinding Path="Product" Target="Products"/></EntitySet></EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;
  res.set("Content-Type", "application/xml").send(metadata);
});

// Helper functions
// ... (semua fungsi helper SAMA PERSIS seperti sebelumnya, tidak perlu disalin ulang jika sudah ada)
function parseODataQuery(query) {
  const options = {};
  if (query.$filter) options.filter = query.$filter;
  if (query.$select)
    options.select = query.$select.split(",").map((field) => field.trim());
  if (query.$orderby) options.orderby = query.$orderby;
  if (query.$top) options.top = parseInt(query.$top);
  if (query.$skip) options.skip = parseInt(query.$skip);
  if (query.$count) options.count = query.$count === "true";
  if (query.$expand)
    options.expand = query.$expand.split(",").map((e) => e.trim());
  return options;
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
    if (filter.includes(" ne ")) {
      const [field, value] = filter.split(" ne ").map((s) => s.trim());
      const cleanValue = value.replace(/'/g, "");
      return item[field].toString() != cleanValue;
    }
    if (filter.includes(" gt ")) {
      const [field, value] = filter.split(" gt ").map((s) => s.trim());
      return item[field] > parseFloat(value);
    }
    if (filter.includes(" lt ")) {
      const [field, value] = filter.split(" lt ").map((s) => s.trim());
      return item[field] < parseFloat(value);
    }
    if (filter.includes("contains(")) {
      const match = filter.match(/contains\((\w+),\s*'([^']+)'\)/);
      if (match) {
        const [, field, value] = match;
        return (
          item[field] && item[field].toLowerCase().includes(value.toLowerCase())
        );
      }
    }
    return true;
  });
}
function applySelect(data, select) {
  if (!select || !data) return data;
  return data.map((item) => {
    const selectedItem = {};
    select.forEach((field) => {
      if (field.includes("/")) {
        const [parent, child] = field.split("/");
        if (item[parent]) {
          if (!selectedItem[parent]) selectedItem[parent] = {};
          selectedItem[parent][child] = item[parent][child];
        }
      } else if (item.hasOwnProperty(field)) {
        selectedItem[field] = item[field];
      }
    });
    return selectedItem;
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
function applyExpand(data, expand, entity) {
  if (!expand || !data) return data;
  const expandableData = JSON.parse(JSON.stringify(data));
  if (entity === "Sales" && expand.includes("Product")) {
    return expandableData.map((sale) => {
      sale.Product = products.find((p) => p.id === sale.productId) || null;
      return sale;
    });
  }
  return expandableData;
}

// EntitySet Endpoints
// ... (semua endpoint GET untuk /Products, /Sales, /Categories SAMA PERSIS seperti sebelumnya)
app.get("/Products", (req, res) => {
  const options = parseODataQuery(req.query);
  let result = [...products];
  result = applyFilter(result, options.filter);
  result = applyOrderBy(result, options.orderby);
  const totalCount = result.length;
  if (options.skip) result = result.slice(options.skip);
  if (options.top) result = result.slice(0, options.top);
  result = applySelect(result, options.select);
  const response = {
    "@odata.context": `${req.protocol}://${req.get("host")}/$metadata#Products`,
    value: result,
  };
  if (options.count) response["@odata.count"] = totalCount;
  res.json(response);
});
app.get("/Sales", (req, res) => {
  const options = parseODataQuery(req.query);
  let result = [...sales];
  result = applyFilter(result, options.filter);
  result = applyOrderBy(result, options.orderby);
  const totalCount = result.length;
  if (options.skip) result = result.slice(options.skip);
  if (options.top) result = result.slice(0, options.top);
  result = applyExpand(result, options.expand, "Sales");
  result = applySelect(result, options.select);
  const response = {
    "@odata.context": `${req.protocol}://${req.get("host")}/$metadata#Sales`,
    value: result,
  };
  if (options.count) response["@odata.count"] = totalCount;
  res.json(response);
});
app.get("/Products\\(:id\\)", (req, res) => {
  const id = parseInt(req.params.id);
  const product = products.find((p) => p.id === id);
  if (!product)
    return res
      .status(404)
      .json({
        error: { code: "NotFound", message: `Product with id ${id} not found` },
      });
  const response = {
    "@odata.context": `${req.protocol}://${req.get(
      "host"
    )}/$metadata#Products/$entity`,
    ...product,
  };
  res.json(response);
});
app.get("/Categories", (req, res) => {
  const options = parseODataQuery(req.query);
  let result = [...categories];
  result = applyFilter(result, options.filter);
  result = applyOrderBy(result, options.orderby);
  const totalCount = result.length;
  if (options.skip) result = result.slice(options.skip);
  if (options.top) result = result.slice(0, options.top);
  result = applySelect(result, options.select);
  const response = {
    "@odata.context": `${req.protocol}://${req.get(
      "host"
    )}/$metadata#Categories`,
    value: result,
  };
  if (options.count) response["@odata.count"] = totalCount;
  res.json(response);
});
app.get("/Categories\\(:id\\)", (req, res) => {
  const id = parseInt(req.params.id);
  const category = categories.find((c) => c.id === id);
  if (!category)
    return res
      .status(404)
      .json({
        error: {
          code: "NotFound",
          message: `Category with id ${id} not found`,
        },
      });
  const response = {
    "@odata.context": `${req.protocol}://${req.get(
      "host"
    )}/$metadata#Categories/$entity`,
    ...category,
  };
  res.json(response);
});
app.get("/Sales\\(:id\\)", (req, res) => {
  const options = parseODataQuery(req.query);
  const id = parseInt(req.params.id);
  let sale = sales.find((s) => s.id === id);
  if (!sale)
    return res
      .status(404)
      .json({
        error: { code: "NotFound", message: `Sale with id ${id} not found` },
      });
  [sale] = applyExpand([sale], options.expand, "Sales");
  const response = {
    "@odata.context": `${req.protocol}://${req.get(
      "host"
    )}/$metadata#Sales/$entity`,
    ...sale,
  };
  res.json(response);
});

// CSV Endpoints for Google Sheets
// ... (kode CSV sama seperti sebelumnya)
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
  const csvData = convertToCSV(sales);
  res.header("Content-Type", "text/csv");
  res.send(csvData);
});

// Start server HANYA untuk development lokal, Vercel akan mengabaikan ini
app.listen(port, () => {
  console.log(`\nOData service (LOKAL) berjalan di http://localhost:${port}`);
});

// Export 'app' untuk Vercel agar bisa menjalankannya sebagai Serverless Function
module.exports = app;
