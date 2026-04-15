import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@calcom/prisma";
import { BookingRepository } from "@calcom/features/bookings/repository/booking.repository";

type ResponseJson = {
  success?: boolean;
  booking?: unknown;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseJson>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, email, start, notes } = req.body;

    if (!name || !email || !start) {
      return res.status(400).json({
        error: "Missing required fields: name, email, start",
      });
    }

    // Get user by username (from env or default)
    const username = process.env.CALCOM_USERNAME || "paulino";
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        eventTypes: {
          where: { active: true },
          take: 1,
        },
      },
    });

    if (!user || user.eventTypes.length === 0) {
      return res.status(404).json({
        error: "Booking user not found",
      });
    }

    const eventType = user.eventTypes[0];
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + eventType.length * 60 * 1000);

    // Create booking directly in database
    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        eventTypeId: eventType.id,
        startTime: startDate,
        endTime: endDate,
        title: eventType.title,
        status: "ACCEPTED",
        references: {
          create: {
            type: "Cal.com",
            uid: Math.random().toString(36).substring(2, 15),
            accessor: "api",
          },
        },
      },
      },
    });

    // Create attendee
    await prisma.attendee.create({
      data: {
        bookingId: booking.id,
        email,
        name,
        locale: "en",
        timeZone: process.env.TIMEZONE || "America/New_York",
      },
    });

    console.log(`[Custom Booking API] Created booking ${booking.id} for ${email}`);

    return res.status(200).json({
      success: true,
      booking: {
        id: booking.id,
        uid: booking.uid,
        startTime: booking.startTime,
        status: booking.status,
      },
    });
  } catch (err) {
    console.error("[Custom Booking API] Error:", err);
    return res.status(500).json({
      error: "Failed to create booking",
    });
  }
}