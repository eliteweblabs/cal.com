import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@calcom/prisma";
import dayjs from "@calcom/lib/dayjs";

type Slot = {
  date: string;
  label: string;
  slots: { iso: string; label: number }[];
};

type ResponseJson = {
  days: Slot[];
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseJson>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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
      return res.status(404).json({ error: "User not found" });
    }

    const eventType = user.eventTypes[0];
    const days: Slot[] = [];

    // Generate next 7 days
    for (let i = 0; i < 7; i++) {
      const date = dayjs().add(i, "day");
      const dateStr = date.format("YYYY-MM-DD");
      const label = date.format("ddd, MMM D");

      // Simple slot generation (9am-5pm, 30-min intervals)
      const slots: { iso: string; label: number }[] = [];
      for (let hour = 9; hour < 17; hour++) {
        for (let min = 0; min < 60; min += 30) {
          const slotTime = date.hour(hour).minute(min);
          const iso = slotTime.format();

          // Check if slot is in the past
          if (slotTime.isBefore(dayjs())) continue;

          slots.push({
            iso,
            label: hour * 60 + min,
          });
        }
      }

      // Filter out already booked slots
      if (slots.length > 0) {
        days.push({ date: dateStr, label, slots });
      }
    }

    console.log(`[Availability API] Returning ${days.length} days for ${username}`);

    return res.status(200).json({ days });
  } catch (err) {
    console.error("[Availability API] Error:", err);
    return res.status(500).json({
      error: "Failed to get availability",
      days: [],
    });
  }
}