export function databaseConfig(connectionString = process.env.QUIZ_DATABASE_URL) {
  if (!connectionString) throw new Error("QUIZ_DATABASE_URL is missing.");
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error("QUIZ_DATABASE_URL is not a valid URL. Encode special password characters."); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname.endsWith('.pooler.supabase.com') || url.port !== '5432' ||
      url.pathname !== '/postgres' || !decodeURIComponent(url.username).startsWith('quiz_reader.') || !url.password ||
      url.searchParams.get('sslmode') !== 'require') {
    throw new Error("Use the quiz_reader Session pooler URL on port 5432 with sslmode=require.");
  }
  // Explicit TLS configuration avoids connection-string options overriding verification.
  for (const key of [...url.searchParams.keys()]) {
    if (key !== 'sslmode') throw new Error("Unexpected database URL option.");
  }
  url.searchParams.delete('sslmode');
  const ca = process.env.QUIZ_DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 8000,
    statement_timeout: 3000,
    application_name: 'mining-safety-sql-quiz'
  };
}
