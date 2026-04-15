// Simple booking API using raw PostgreSQL (like reave.app)
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.CALCOM_DATABASE_URL,
});

await client.connect();

export default async function handler(req: Request) {
  const url = new URL(req.url);
  
  // GET /api/booking/availability
  if (req.method === "GET" && url.pathname === "/api/booking/availability") {
    const username = process.env.CALCOM_USERNAME || "reave";
    
    const userRes = await client.query(
      `SELECT u.id, et.id as event_type_id, et.length
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1 AND et.active = true
       LIMIT 1`,
      [username]
    );

    if (userRes.rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const { length } = userRes.rows[0];
    const days = [];
    
    // Generate next 7 days
    for (let i = 1; i <= 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      
      const slots = [];
      for (let hour = 9; hour < 17; hour++) {
        for (let min = 0; min < 60; min += 30) {
          const iso = new Date(date).setHours(hour, min, 0, 0);
          slots.push({
            iso: new Date(iso).toISOString(),
            label: hour * 60 + min,
          });
        }
      }
      
      if (slots.length > 0) {
        days.push({
          date: dateStr,
          label: new Date(dateStr).toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric"
          }),
          slots: slots.slice(0, 8), // Limit slots
        });
      }
    }

    return Response.json({ days, slotLength: 30 });
  }
  
  // POST /api/booking/create
  if (req.method === "POST" && url.pathname === "/api/booking/create") {
    const body = await req.json();
    const { name, email, start, notes } = body;

    if (!name || !email || !start) {
      return Response.json({ error: "Missing name, email, start" }, { status: 400 });
    }

    const username = process.env.CALCOM_USERNAME || "reave";
    
    const userRes = await client.query(
      `SELECT u.id, et.id as event_type_id, et.slug, et.length
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       LIMIT 1`,
      [username]
    );

    if (userRes.rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const { id: userId, event_type_id, length } = userRes.rows[0];
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + length * 60000);

    // Create booking
    const booking = await client.query(
      `INSERT INTO "Booking" ("userId", "eventTypeId", "startTime", "endTime", "title", "status")
       VALUES ($1, $2, $3, $4, $5, 'ACCEPTED')
       RETURNING id, uid`,
      [userId, event_type_id, startDate, endDate, "Booked Meeting"]
    );

    // Create attendee
    await client.query(
      `INSERT INTO "Attendee" ("bookingId", "email", "name", "locale", "timeZone")
       VALUES ($1, $2, $3, 'en', 'America/New_York')`,
      [booking.rows[0].id, email, name]
    );

    return Response.json({
      success: true,
      booking: {
        id: booking.rows[0].id,
        uid: booking.rows[0].uid,
        startTime: startDate.toISOString(),
        status: "ACCEPTED",
      },
    });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}