# OData Service dengan Node.js

Implementasi OData service menggunakan Node.js dan Express yang mendukung operasi CRUD dan query OData standar.

## Instalasi

1. **Install dependencies:**

```bash
npm install
```

2. **Jalankan server:**

```bash
npm start
```

Atau untuk development dengan auto-reload:

```bash
npm run dev
```

Server akan berjalan di `http://localhost:3000`

## Endpoints yang Tersedia

### Service Document

- **GET** `/` - Service document yang menampilkan entity sets yang tersedia

### Metadata

- **GET** `/$metadata` - Metadata dokumen dalam format XML

### Products

- **GET** `/Products` - Mendapatkan semua produk
- **GET** `/Products(1)` - Mendapatkan produk berdasarkan ID
- **POST** `/Products` - Membuat produk baru
- **PUT** `/Products(1)` - Update produk berdasarkan ID
- **DELETE** `/Products(1)` - Hapus produk berdasarkan ID

### Categories

- **GET** `/Categories` - Mendapatkan semua kategori
- **GET** `/Categories(1)` - Mendapatkan kategori berdasarkan ID

## Query Options yang Didukung

### $filter (Filtering)

```bash
# Produk dengan harga sama dengan 15000000
GET /Products?$filter=price eq 15000000

# Produk dengan harga lebih dari 10000000
GET /Products?$filter=price gt 10000000

# Produk yang nama mengandung "iPhone"
GET /Products?$filter=contains(name,'iPhone')

# Produk yang tersedia (inStock = true)
GET /Products?$filter=inStock eq true
```

### $select (Projection)

```bash
# Hanya ambil field name dan price
GET /Products?$select=name,price

# Ambil id, name, dan category
GET /Products?$select=id,name,category
```

### $orderby (Sorting)

```bash
# Urutkan berdasarkan nama (ascending)
GET /Products?$orderby=name

# Urutkan berdasarkan harga (descending)
GET /Products?$orderby=price desc

# Urutkan berdasarkan tanggal dibuat
GET /Products?$orderby=createdDate
```

### $top dan $skip (Pagination)

```bash
# Ambil 3 produk pertama
GET /Products?$top=3

# Skip 2 produk pertama, ambil sisanya
GET /Products?$skip=2

# Skip 2, ambil 3 berikutnya (pagination)
GET /Products?$skip=2&$top=3
```

### $count (Count)

```bash
# Ambil data dengan jumlah total record
GET /Products?$count=true

# Kombinasi dengan filter dan count
GET /Products?$filter=price gt 10000000&$count=true
```

### Kombinasi Query Options

```bash
# Filter, sort, dan pagination
GET /Products?$filter=category eq 'Electronics'&$orderby=price desc&$top=2

# Select fields tertentu dengan filter
GET /Products?$select=name,price&$filter=inStock eq true

# Semua query options digabung
GET /Products?$filter=price gt 5000000&$select=name,price,category&$orderby=price&$top=5&$skip=0&$count=true
```

## Contoh CRUD Operations

### 1. Create Product (POST)

```bash
curl -X POST http://localhost:3000/Products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "iPad Air",
    "price": 8000000,
    "category": "Electronics",
    "description": "Apple tablet with M1 chip",
    "inStock": true
  }'
```

### 2. Read Products (GET)

```bash
# Semua produk
curl http://localhost:3000/Products

# Produk spesifik
curl http://localhost:3000/Products(1)

# Dengan filter
curl "http://localhost:3000/Products?\$filter=price gt 10000000"
```

### 3. Update Product (PUT)

```bash
curl -X PUT http://localhost:3000/Products(1) \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop Dell XPS 13 Updated",
    "price": 14000000,
    "category": "Electronics",
    "description": "Updated description",
    "inStock": false
  }'
```

### 4. Delete Product (DELETE)

```bash
curl -X DELETE http://localhost:3000/Products(1)
```

## Sample Data

Service ini sudah dilengkapi dengan sample data:

### Products

- Laptop Dell XPS 13 (Rp 15.000.000)
- iPhone 15 Pro (Rp 18.000.000)
- Samsung Galaxy S24 (Rp 12.000.000)
- MacBook Air M2 (Rp 16.000.000)
- Sony WH-1000XM4 (Rp 4.500.000)

### Categories

- Electronics
- Audio
- Computers

## Fitur OData yang Didukung

✅ **Query Options:**

- $filter (eq, ne, gt, lt, contains)
- $select
- $orderby
- $top
- $skip
- $count

✅ **CRUD Operations:**

- CREATE (POST)
- READ (GET)
- UPDATE (PUT)
- DELETE (DELETE)

✅ **OData Metadata:**

- Service Document
- Metadata Document ($metadata)
- Entity Data Model (EDM)

✅ **Error Handling:**

- HTTP status codes yang tepat
- Error messages dalam format OData

## Pengembangan Lebih Lanjut

Untuk pengembangan yang lebih kompleks, Anda bisa menambahkan:

1. **Database Integration** (MongoDB, PostgreSQL, MySQL)
2. **Authentication & Authorization**
3. **Entity Relationships** (Navigation Properties)
4. **Batch Operations**
5. **More Query Options** ($expand, $search, dll)
6. **Validation & Data Types**
7. **Caching**
8. **Logging**

## Testing

Anda bisa test service ini menggunakan:

- **Postman** - Import collection untuk testing
- **cURL** - Command line testing
- **Browser** - Untuk GET requests
- **OData clients** - Seperti Apache Olingo

Contoh testing dengan browser:

- http://localhost:3000/
- http://localhost:3000/$metadata
- http://localhost:3000/Products
- http://localhost:3000/Products?$filter=price gt 10000000
