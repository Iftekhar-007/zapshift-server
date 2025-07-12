const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
var admin = require("firebase-admin");

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    console.log("mongodb connected");
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

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };

      const user = await usersCollections.findOne(query);

      if (!user || user.role !== "admin") {
        res.status(403).send({ message: "forbidden access" });
      }

      next();
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

    app.get("/riders/pending", verifyFBToken, verifyAdmin, async (req, res) => {
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

    app.patch("/users/make-admin/:email", verifyFBToken, async (req, res) => {
      const requesterEmail = req.decoded.email;
      const requester = await usersCollections.findOne({
        email: requesterEmail,
      });

      if (requester.role !== "admin") {
        return res.status(403).send({ message: "Forbidden: Admins only" });
      }

      const targetEmail = req.params.email;
      const result = await usersCollections.updateOne(
        { email: targetEmail },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    // Approve rider
    app.patch("/riders/approve/:id", async (req, res) => {
      const id = req.params.id;
      const { email } = req.body;
      const result = await ridersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved" } }
      );

      if (email) {
        const userResult = await usersCollections.updateOne(
          { email: email },
          { $set: { role: "rider" } }
        );
        console.log("User role updated:", userResult);
      } else {
        console.warn("No email provided to update user role");
      }

      res.send(result);
    });

    app.get(
      "/users/role/:email",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const user = await usersCollections.findOne({ email });

        if (!user) return res.status(404).send({ role: "user" }); // fallback

        res.send({ role: user.role || "user" }); // <== must send as object with `role` key
      }
    );

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

    app.get("/riders/active", verifyFBToken, verifyAdmin, async (req, res) => {
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

    // Search users
    app.get("/users/search", async (req, res) => {
      const search = req.query.q;
      console.log("Search query received:", search); // Debug log
      if (!search || search.trim() === "") {
        return res.status(400).send({ message: "Search query required" });
      }
      const users = await usersCollections
        .find({
          $or: [
            { email: { $regex: search, $options: "i" } },
            { name: { $regex: search, $options: "i" } },
          ],
        })
        .limit(10)
        .toArray();
      res.send(users);
    });

    // Make Admin
    app.patch("/users/make-admin/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollections.updateOne(
        { email },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    // Remove Admin
    app.patch("/users/remove-admin/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollections.updateOne(
        { email },
        { $set: { role: "user" } }
      );
      res.send(result);
    });

    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "🏠Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }

  app.get("/", (req, res) => {
    res.send("🚚 Delivery Server is Running!");
  });

  app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
  });
}
run().catch(console.dir);
