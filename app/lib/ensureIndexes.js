// Makes sure a model's indexes exist before the code relies on one of them
// (here: the unique index that stops a retried report being saved twice).
//
// Mongoose builds a model's indexes by itself the first time the model is used.
// If that happens while the database connection is still opening (the first
// requests after a server start), it fails quietly, and `await Model.init()`
// then returns that same failed promise for the rest of the process's life, so
// every request that awaited it would fail until the server was restarted. This
// builds them on demand instead, remembers only a success, and lets the next
// request try again after a failure.
//
// Call it after `await connectDB()`, so the connection is open.

const pending = new WeakMap();

export default function ensureIndexes(model) {
  let promise = pending.get(model);
  if (!promise) {
    promise = model.createIndexes().catch((err) => {
      pending.delete(model);
      throw err;
    });
    pending.set(model, promise);
  }
  return promise;
}
