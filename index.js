const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const addTrackingLog = require("./utils/addTrackingLog");

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
    const trackingLogs = database.collection("trackingLogs");

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

    const verifyRider = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };

      const user = await usersCollections.findOne(query);

      if (!user || user.role !== "rider") {
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
        res.status(201).json({
          message: "Parcel added",
          insertedId: result.insertedId,
          _id: result.insertedId, // <- for safety
          trackingId: parcel.trackingId, // <- send back for logging
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to add parcel" });
      }
    });

    app.post("/track/logs", verifyFBToken, async (req, res) => {
      const { trackingId, parcelId, status, message } = req.body;

      if (!trackingId || !parcelId || !status || !message) {
        return res.status(400).send({ message: "Missing required fields" });
      }

      try {
        await addTrackingLog({
          db: database,
          trackingId,
          parcelId,
          status,
          message,
        });
        res.send({ message: "Tracking log added" });
      } catch (err) {
        console.error("Tracking log POST failed:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // ✅ API to get tracking logs by trackingId
    app.get("/track/logs/:trackingId", async (req, res) => {
      try {
        const { trackingId } = req.params;
        const logs = await trackingLogs
          .find({ trackingId })
          .sort({ timestamp: 1 })
          .toArray();

        if (!logs.length) {
          return res.status(404).send({ message: "No tracking logs found" });
        }

        res.send(logs);
      } catch (err) {
        console.error("Tracking log error:", err);
        res.status(500).send({ message: "Internal server error" });
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

    // 📦 GET /riders/tasks?email=rider@gmail.com
    app.get("/riders/tasks", verifyFBToken, verifyRider, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Rider email is required" });
      }

      try {
        const tasks = await parcelsCollections
          .find({
            assignedRiderEmail: email,
            deliveryStatus: { $in: ["rider-assigned", "in-transit"] },
          })
          .toArray();

        res.status(200).send(tasks);
      } catch (err) {
        console.error("❌ Failed to fetch rider tasks:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // ✅ GET completed deliveries for a rider
    app.get(
      "/riders/completed-deliveries",
      verifyFBToken,
      verifyRider,
      async (req, res) => {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: "Rider email is required" });

        try {
          const completed = await parcelsCollections
            .find({
              assignedRiderEmail: email,
              deliveryStatus: {
                $in: ["delivered", "service_center_delivered"],
              },
            })
            .toArray();

          res.status(200).send(completed);
        } catch (err) {
          console.error("❌ Failed to fetch completed deliveries:", err);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );

    // Add this POST route to your Express server
    app.patch(
      "/riders/cashout",
      verifyFBToken,
      verifyRider,
      async (req, res) => {
        const email = req.decoded.email;
        const { amount, parcelId } = req.body;

        if (!amount || typeof amount !== "number" || amount <= 0 || !parcelId) {
          return res.status(400).send({ message: "Invalid request" });
        }

        try {
          // 1. Find parcel
          const parcel = await parcelsCollections.findOne({
            _id: new ObjectId(parcelId),
          });
          if (!parcel)
            return res.status(404).send({ message: "Parcel not found" });

          // 2. Validate parcel cashout state
          if (parcel.isCashedOut) {
            return res.status(400).send({ message: "Already cashed out" });
          }

          // 3. Calculate expected earning
          const expectedAmount =
            parcel.senderDistrict === parcel.receiverDistrict ? 80 : 150;
          if (amount !== expectedAmount) {
            return res.status(400).send({ message: "Invalid cashout amount" });
          }

          // 4. Get rider
          const rider = await ridersCollection.findOne({ email });
          if (!rider)
            return res.status(404).send({ message: "Rider not found" });

          // 5. Get total earnings from parcels
          const completedParcels = await parcelsCollections
            .find({
              assignedRiderEmail: email,
              deliveryStatus: {
                $in: ["delivered", "service_center_delivered"],
              },
            })
            .toArray();

          const totalEarned = completedParcels.reduce(
            (sum, p) =>
              sum + (p.senderDistrict === p.receiverDistrict ? 80 : 150),
            0
          );

          const alreadyCashedOut = rider.totalCashedOut || 0;
          const pending = totalEarned - alreadyCashedOut;

          if (pending < expectedAmount) {
            return res.status(400).send({ message: "Insufficient balance" });
          }

          // ✅ 6. Update rider cashout
          await ridersCollection.updateOne(
            { email },
            {
              $inc: { totalCashedOut: expectedAmount },
              $push: {
                cashoutHistory: {
                  amount: expectedAmount,
                  date: new Date(),
                  parcelId,
                },
              },
            }
          );

          // ✅ 7. Mark parcel as cashed out
          await parcelsCollections.updateOne(
            { _id: new ObjectId(parcelId) },
            { $set: { isCashedOut: true } }
          );

          res.send({ message: "Cashout successful", amount: expectedAmount });
        } catch (err) {
          console.error("Cashout error:", err);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    app.get(
      "/riders/earning-summary",
      verifyFBToken,
      verifyRider,
      async (req, res) => {
        // const email = req.decoded.email;
        // const email = req.query.email || req.decoded.email;
        const email = req.decoded.email;
        // const deliveredTime = new Date(p.deliveredTime);

        try {
          const completed = await parcelsCollections
            .find({
              assignedRiderEmail: email,
              deliveryStatus: {
                $in: ["delivered", "service_center_delivered"],
              },
            })
            .toArray();

          const totalEarning = completed.reduce(
            (sum, p) =>
              sum + (p.senderDistrict === p.receiverDistrict ? 80 : 150),
            0
          );

          const rider = await ridersCollection.findOne({ email });

          const totalCashedOut = rider?.totalCashedOut || 0;
          const pending = totalEarning - totalCashedOut;

          const now = new Date();
          const startOfToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          const filterByTime = (parcels, startTime) =>
            parcels.filter((p) => {
              const deliveredTime = new Date(p.deliveredTime);
              return deliveredTime >= startTime;
            });

          const todayEarn = filterByTime(completed, startOfToday).reduce(
            (sum, p) =>
              sum + (p.senderDistrict === p.receiverDistrict ? 80 : 150),
            0
          );

          const weeklyEarn = filterByTime(completed, startOfWeek).reduce(
            (sum, p) =>
              sum + (p.senderDistrict === p.receiverDistrict ? 80 : 150),
            0
          );

          const monthlyEarn = filterByTime(completed, startOfMonth).reduce(
            (sum, p) =>
              sum + (p.senderDistrict === p.receiverDistrict ? 80 : 150),
            0
          );

          // res.send({
          //   totalEarning,
          //   totalCashedOut,
          //   pending,
          //   todayEarn,
          //   weeklyEarn,
          //   monthlyEarn,
          // });

          // res.send({
          //   totalEarning: 500,
          //   totalCashedOut: 100,
          //   pending: 400,
          //   todayEarn: 80,
          //   weeklyEarn: 240,
          //   monthlyEarn: 480,
          // });

          console.log("/riders/earnings-summary hit");

          res.send({
            totalEarning,
            totalCashedOut,
            pendingAmount: totalEarning - totalCashedOut,
            todayEarning: todayEarn,
            weeklyEarning: weeklyEarn,
            monthlyEarning: monthlyEarn,
          });
        } catch (err) {
          console.error("Earning summary error:", err);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );

    app.patch("/parcels/assign-rider/:id", async (req, res) => {
      const id = req.params.id;
      const { assignedRiderId, assignedRiderName, assignedRiderEmail } =
        req.body;

      const result = await parcelsCollections.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            assignedRiderId,
            assignedRiderName,
            assignedRiderEmail,
            deliveryStatus: "rider-assigned", // ✅ NEW
          },
        }
      );

      res.send(result);
    });

    app.get("/parcels", async (req, res) => {
      try {
        const { paymentStatus, deliveryStatus } = req.query;
        const query = {};
        // if (email) (query.email = "created by :"), email;
        if (paymentStatus) query.paymentStatus = paymentStatus;
        if (deliveryStatus) query.deliveryStatus = deliveryStatus;

        const parcels = await parcelsCollections.find(query).toArray();
        console.log(query);
        res.json(parcels);
      } catch (error) {
        res.status(500).json({ error: "Failed to get parcels" });
      }
    });

    // PATCH /parcels/:id/status
    app.patch("/parcels/:id/status", async (req, res) => {
      const id = req.params.id;
      const { deliveryStatus } = req.body;

      const updateData = { deliveryStatus };

      if (deliveryStatus === "in-transit") {
        updateData.pickupTime = new Date(); // ✅ add pickup time
      }

      if (
        deliveryStatus === "delivered" ||
        deliveryStatus === "service_center_delivered"
      ) {
        updateData.deliveredTime = new Date(); // ✅ add delivery time
      }

      const result = await parcelsCollections.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      res.send(result);
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
