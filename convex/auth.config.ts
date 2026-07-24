// Required by @convex-dev/auth — tells Convex to accept JWTs issued by
// this deployment itself (CONVEX_SITE_URL) for the "convex" application.
const authConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
