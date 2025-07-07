const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

// Middlewares
app.use(
  cors({
    origin: "http://localhost:5173", // frontend URL
    credentials: true, // allow cookies/headers
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@iftekharbases.ulu3uwc.mongodb.net/?retryWrites=true&w=majority&appName=IftekharBases`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const database = client.db("zapshift");
    const parcelsCollections = database.collection("parcels");

    app.post("/parcels", async (req, res) => {
      try {
        const parcel = req.body;

        // Optional basic validation
        if (!parcel.title || !parcel.type) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        // parcel.createdAt = new Date();
        // parcel.status = "pending";

        const result = await parcelsCollections.insertOne(parcel);
        res
          .status(201)
          .json({ message: "Parcel added", insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to add parcel" });
      }
    });

    app.get("/parcels", async (req, res) => {
      try {
        const parcels = await parcelsCollections.find().toArray();
        res.json(parcels);
      } catch (error) {
        res.status(500).json({ error: "Failed to get parcels" });
      }
    });
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "🏠Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("🚚 Delivery Server is Running!");
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
