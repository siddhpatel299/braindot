import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every anonymous caller gets a rate-limit row of its own and never comes
// back for it, so without a sweep the table only grows. Signed-in users reuse
// one row each and are unaffected either way.
crons.daily(
  "sweep spent rate limits",
  { hourUTC: 4, minuteUTC: 0 },
  internal.rateLimit.sweep,
  {},
);

export default crons;
