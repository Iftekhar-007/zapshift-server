const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
var admin = require("firebase-admin");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();

// Middlewares
app.use(
  cors({
    origin: "http://localhost:5173", // frontend URL
    credentials: true, // allow cookies/headers
  })
);
app.use(express.json());

var serviceAccount = require("./FB_TOKEN.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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

    const usersCollections = database.collection("users");
    const parcelsCollections = database.collection("parcels");
    const ridersCollection = database.collection("riders");

    const verifyFBToken = async (req, res, next) => {
      const authHeaders = req.headers.authorization;

      if (!authHeaders) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeaders.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch {
        return res.status(401).send({ message: "unauthorized access" });
      }
    };

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

    app.post("/users", async (req, res) => {
      const email = req.body.email;

      const usersExists = await usersCollections.findOne({ email });

      if (usersExists) {
        return res
          .status(202)
          .send({ message: "users already exists", inserted: false });
      }

      const user = req.body;
      const result = await usersCollections.insertOne(user);
      res.send(result);
    });

    app.post("/riders", async (req, res) => {
      try {
        const rider = req.body;

        // const email = req.decoded.email;

        // // Validate and insert logic here...

        // rider.email = email; // enforce email from token
        // rest is same...

        // Basic validation
        // if (
        //   !rider.name ||
        //   !rider.email ||
        //   !rider.phone ||
        //   !rider.region ||
        //   !rider.district ||
        //   !rider.bikeName ||
        //   !rider.bikeLicense
        // ) {
        //   return res
        //     .status(400)
        //     .json({ message: "Missing required rider fields" });
        // }

        // Add default values
        rider.status = "pending";
        rider.appliedAt = new Date();

        const result = await ridersCollection.insertOne(rider);
        res.status(201).json({
          message: "Rider application submitted",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding rider:", error);
        res
          .status(500)
          .json({ message: "Failed to submit rider", error: error.message });
      }
    });

    app.get("/riders/pending", async (req, res) => {
      try {
        const pendingRiders = await ridersCollection
          .find({ status: "pending" })
          .toArray();
        res.status(200).json(pendingRiders);
      } catch (error) {
        console.error("Error fetching pending riders:", error);
        res.status(500).json({ error: "Failed to fetch pending riders" });
      }
    });

    // Approve rider
    app.patch("/riders/approve/:id", async (req, res) => {
      const id = req.params.id;
      const result = await ridersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved" } }
      );
      res.send(result);
    });

    // Cancel rider
    app.delete("/riders/cancel/:id", async (req, res) => {
      const id = req.params.id;
      const result = await ridersCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/my-parcels", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const userParcels = await parcelsCollections
          .find({ createdBy: email })
          .toArray();

        res.json(userParcels);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch user parcels" });
      }
    });

    app.get("/riders/active", async (req, res) => {
      try {
        const activeRiders = await database
          .collection("riders")
          .find({ status: "approved" })
          .toArray();
        res.json(activeRiders);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch active riders" });
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
