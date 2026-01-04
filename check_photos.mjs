import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

const photos = await db.query.unmatchedPhotos.findMany({
  where: (unmatchedPhotos, { eq }) => eq(unmatchedPhotos.reviewed, "pending")
});

console.log("Unmatched photos:");
photos.forEach(p => {
  const date = p.takenAt ? new Date(p.takenAt).toISOString().split('T')[0] + ' ' + new Date(p.takenAt).toISOString().split('T')[1].substring(0,8) : 'no date';
  console.log(`ID: ${p.id}, File: ${p.fileName}, Date: ${date}, GPS: ${p.latitude}, ${p.longitude}`);
});

await connection.end();
