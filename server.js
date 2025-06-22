const express = require("express");
const cors = require("cors");
const path = require("path");
const xlsx = require("xlsx");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- DATA LOADING ---
let products = [];
let categories = [];
let sales = [];

const loadXLSXData = (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath, { cellDates: true });
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
    const gudangFilePath = path.join(__dirname, "data", "data_gudang.xlsx");
    const penjualanFilePath = path.join(
      __dirname,
      "data",
      "data_penjualan.xlsx"
    );

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

    const categoryNames = [
      ...new Set(products.map((p) => p.category).filter(Boolean)),
    ];
    categories = categoryNames.map((name, index) => ({
      id: index + 1,
      name: name,
      description: `Kategori untuk ${name}`,
    }));
    console.log(`${categories.length} kategori berhasil dibuat.`);

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
  }
};

initializeData();

const odataHeaders = (req, res, next) => {
  res.set({
    "OData-Version": "4.0",
    "Content-Type": "application/json;odata.metadata=minimal",
  });
  next();
};

// --- ODATA ENDPOINTS ---

// OData Service Document
app.get("/", odataHeaders, (req, res) => {
  const serviceDocument = {
    "@odata.context": "$metadata", // PERBAIKAN DI SINI
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
  res.set({ "Content-Type": "application/xml", "OData-Version": "4.0" });
  res.send(metadata);
});

// Helper functions (tidak ada perubahan)
function parseODataQuery(query) {
  const o = {};
  return (
    query.$filter && (o.filter = query.$filter),
    query.$select && (o.select = query.$select.split(",").map((e) => e.trim())),
    query.$orderby && (o.orderby = query.$orderby),
    query.$top && (o.top = parseInt(query.$top, 10)),
    query.$skip && (o.skip = parseInt(query.$skip, 10)),
    query.$count && (o.count = "true" === query.$count),
    query.$expand && (o.expand = query.$expand.split(",").map((e) => e.trim())),
    o
  );
}
function applyFilter(data, filter) {
  if (!filter) return data;
  return data.filter((item) => {
    if (filter.includes(" eq ")) {
      const [field, value] = filter.split(" eq ").map((s) => s.trim()),
        cleanValue = value.replace(/'/g, "");
      return null == item[field]
        ? (_) => _ == cleanValue
        : item[field].toString() == cleanValue;
    }
    if (filter.includes(" ne ")) {
      const [field, value] = filter.split(" ne ").map((s) => s.trim());
      return item[field].toString() != value.replace(/'/g, "");
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
    return !0;
  });
}
function applySelect(data, select) {
  if (!select || !data) return data;
  return data.map((item) => {
    const e = {};
    return (
      select.forEach((t) => {
        if (t.includes("/")) {
          const [o, r] = t.split("/");
          item[o] && (e[o] || (e[o] = {}), (e[o][r] = item[o][r]));
        } else item.hasOwnProperty(t) && (e[t] = item[t]);
      }),
      e
    );
  });
}
function applyOrderBy(data, orderby) {
  if (!orderby) return data;
  const [field, direction] = orderby.split(" "),
    desc = direction && "desc" === direction.toLowerCase();
  return data.sort((a, b) => {
    return null === a[field]
      ? 1
      : null === b[field]
      ? -1
      : a[field] < b[field]
      ? desc
        ? 1
        : -1
      : a[field] > b[field]
      ? desc
        ? -1
        : 1
      : 0;
  });
}
function applyExpand(data, expand, entity) {
  if (!expand || !data) return data;
  const e = JSON.parse(JSON.stringify(data));
  return "Sales" === entity && expand.includes("Product")
    ? e.map((a) => {
        return (
          (a.Product = products.find((e) => e.id === a.productId) || null), a
        );
      })
    : e;
}

// EntitySet Endpoints
app.get("/Products", odataHeaders, (req, res) => {
  const options = parseODataQuery(req.query);
  let result = [...products];
  result = applyFilter(result, options.filter);
  result = applyOrderBy(result, options.orderby);
  const totalCount = result.length;
  if (options.skip) result = result.slice(options.skip);
  if (options.top) result = result.slice(0, options.top);
  result = applySelect(result, options.select);
  const response = { "@odata.context": "$metadata#Products", value: result }; // PERBAIKAN DI SINI
  if (options.count) response["@odata.count"] = totalCount;
  res.json(response);
});

app.get("/Sales", odataHeaders, (req, res) => {
  const options = parseODataQuery(req.query);
  let result = [...sales];
  result = applyFilter(result, options.filter);
  result = applyOrderBy(result, options.orderby);
  const totalCount = result.length;
  if (options.skip) result = result.slice(options.skip);
  if (options.top) result = result.slice(0, options.top);
  result = applyExpand(result, options.expand, "Sales");
  result = applySelect(result, options.select);
  const response = { "@odata.context": "$metadata#Sales", value: result }; // PERBAIKAN DI SINI
  if (options.count) response["@odata.count"] = totalCount;
  res.json(response);
});

app.get("/Categories", odataHeaders, (req, res) => {
  const options = parseODataQuery(req.query);
  let result = [...categories];
  result = applyFilter(result, options.filter);
  result = applyOrderBy(result, options.orderby);
  const totalCount = result.length;
  if (options.skip) result = result.slice(options.skip);
  if (options.top) result = result.slice(0, options.top);
  result = applySelect(result, options.select);
  const response = { "@odata.context": "$metadata#Categories", value: result }; // PERBAIKAN DI SINI
  if (options.count) response["@odata.count"] = totalCount;
  res.json(response);
});

// Single Entity Endpoints
app.get("/Products\\(:id\\)", odataHeaders, (req, res) => {
  const id = parseInt(req.params.id);
  const product = products.find((p) => p.id === id);
  if (!product)
    return res
      .status(404)
      .json({
        error: { code: "NotFound", message: `Product with id ${id} not found` },
      });
  const response = {
    "@odata.context": "../$metadata#Products/$entity",
    ...product,
  }; // PERBAIKAN DI SINI
  res.json(response);
});

app.get("/Categories\\(:id\\)", odataHeaders, (req, res) => {
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
    "@odata.context": "../$metadata#Categories/$entity",
    ...category,
  }; // PERBAIKAN DI SINI
  res.json(response);
});

app.get("/Sales\\(:id\\)", odataHeaders, (req, res) => {
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
  const response = { "@odata.context": "../$metadata#Sales/$entity", ...sale }; // PERBAIKAN DI SINI
  res.json(response);
});

// CSV Endpoints for Google Sheets (tidak ada perubahan)
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

// Error handling & Start server
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({
      error: {
        code: "InternalServerError",
        message: "An internal server error occurred",
      },
    });
});

app.listen(port, () => {
  console.log(`OData service (LOKAL) berjalan di http://localhost:${port}`);
});

module.exports = app;
