const net = require("node:net");
const {getDefaultIpLocation}=require('./ipLocation');

function requestIdentity(req) {
  const session = req.session?.appSession;
  let ip = String(req.ip || req.socket?.remoteAddress || "");
  if (ip.startsWith("::ffff:") && net.isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return {
    ip_address: net.isIP(ip) ? ip : null,
    user_agent: String(req.get?.("user-agent") || "").slice(0, 1024),
    user_id: session?.user?.user_id || null,
    username: session?.user?.username || null,
    workspace_code: session?.user?.workspace_code || null
  };
}

function createActivityAudit(pool, {flushMs = 1000, maxQueue = 1000, batchSize = 100,
  logger = console,ipLocation=getDefaultIpLocation()} = {}) {
  let queue = [];
  let flushing = false;
  let dropped = 0;
  let failed = 0;
  const locationQueue=new Set(),located=new Set();let locationFailed=0;
  function queueLocation(ip){if(ipLocation&&ip&&!located.has(ip)&&locationQueue.size<maxQueue)locationQueue.add(ip);}
  async function flush() {
    if (flushing || (!queue.length&&!locationQueue.size)) return;
    flushing = true;
    const batch = queue.splice(0, batchSize);
    try {
      if(batch.length)await pool.query("SELECT app_audit.record_requests($1::jsonb)", [JSON.stringify(batch)]);
    } catch (error) {
      failed += batch.length;
      logger.error("Activity audit batch failed", {events: batch.length, code: error.code});
    }
    try {
      const ips=[...locationQueue].slice(0,100);for(const ip of ips)locationQueue.delete(ip);
      const locations=[];for(const ip of ips){const row=await ipLocation.lookup(ip);if(row)locations.push(row);}
      if(locations.length){await pool.query('SELECT app_audit.record_ip_locations($1::jsonb)',[JSON.stringify(locations)]);
        for(const row of locations){located.add(row.ip_address);if(located.size>10000)located.delete(located.values().next().value);}}
    }catch(error){locationFailed++;logger.error('IP location audit batch failed',{code:error.code});
    }finally {
      flushing = false;
    }
  }
  const timer = setInterval(() => { void flush(); }, flushMs);
  timer.unref?.();

  function middleware(req, res, next) {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const page = ["/", "/index.html", "/home.html", "/monuments.html", "/archive.html",
      "/viewer.html", "/public-viewer.html"].includes(path);
    const api = path.startsWith("/api/") && !["/api/health", "/api/test"].includes(path);
    if (!page && !api) return next();
    const start = process.hrtime.bigint();
    res.once("finish", () => {
      if (queue.length >= maxQueue) {
        dropped += 1;
        if (dropped === 1 || dropped % 100 === 0) logger.warn("Activity audit queue full", {dropped});
        return;
      }
      const identity=requestIdentity(req);queueLocation(identity.ip_address);
      queue.push({
        ...identity,
        occurred_at: new Date().toISOString(),
        event_kind: page ? "page_request" : "api_request",
        http_method: String(req.method || "GET").slice(0, 10),
        path: path.slice(0, 512),
        status_code: res.statusCode,
        duration_ms: Math.max(0, Math.round(Number(process.hrtime.bigint() - start) / 1e6))
      });
    });
    next();
  }

  async function successfulLogin(req, session) {
    const identity = requestIdentity(req);
    queueLocation(identity.ip_address);
    try {
      await pool.query("SELECT app_audit.record_login($1, $2, $3, $4::inet, $5)", [
        session.user.user_id, session.user.username, session.user.workspace_code,
        identity.ip_address, identity.user_agent
      ]);
    } catch (error) {
      logger.error("Login history insert failed", {code: error.code});
    }
  }
  return {middleware, successfulLogin, flush,
    stats: () => ({queued: queue.length, dropped, failed,locationQueued:locationQueue.size,locationFailed}),
    close: async () => { clearInterval(timer); await flush(); }};
}

module.exports = {createActivityAudit, requestIdentity};
