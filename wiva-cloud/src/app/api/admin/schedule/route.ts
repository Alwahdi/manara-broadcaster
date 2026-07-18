import { revalidatePath } from "next/cache";
import { requireAdminRequest } from "@/lib/auth";
import { audit, createMatchSchedule, listMatchSchedule } from "@/lib/db";
import { validateMatchScheduleInput } from "@/lib/match-schedule";
import { assertSameOrigin, errorResponse, jsonBody } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const input = validateMatchScheduleInput(await jsonBody<Record<string, unknown>>(request));
    const id = await createMatchSchedule(input);
    await audit("schedule.create", "match", id, { homeTeam: input.homeTeam, awayTeam: input.awayTeam, startsAt: input.startsAt });
    revalidatePath("/");
    return Response.json({ ok: true, matches: await listMatchSchedule() }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
