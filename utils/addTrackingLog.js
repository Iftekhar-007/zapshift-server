const { ObjectId } = require("mongodb");

const addTrackingLog = async ({
  db,
  trackingId,
  parcelId,
  status,
  message,
}) => {
  const log = {
    trackingId,
    parcelId: new ObjectId(parcelId),
    status,
    message,
    timestamp: new Date(),
  };
  await db.collection("trackingLogs").insertOne(log);
};

module.exports = addTrackingLog;
