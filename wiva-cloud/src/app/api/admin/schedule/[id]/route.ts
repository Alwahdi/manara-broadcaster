import { revalidatePath } from "next/cache";
import { requireAdminRequest } from "@/lib/auth";
import { audit, deleteMatchSchedule, listMatchSchedule, updateMatchSchedule } from "@/lib/db";
import { validateMatchScheduleInput } from "@/lib/match-schedule";
import { assertSameOrigin, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params;
    const body = await jsonBody<Record<string, unknown>>(request);
    const input = Object.keys(body).length === 1 && typeof body.isActive === "boolean"
      ? { isActive: body.isActive }
      : validateMatchScheduleInput(body);
    if (!(await updateMatchSchedule(id, input))) throw new HttpError(404, "المباراة غير موجودة");
    await audit("schedule.update", "match", id, input);
    revalidatePath("/");
    return Response.json({ ok: true, matches: await listMatchSchedule() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params;
    if (!(await deleteMatchSchedule(id))) throw new HttpError(404, "المباراة غير موجودة");
    await audit("schedule.delete", "match", id, {});
    revalidatePath("/");
    return Response.json({ ok: true, matches: await listMatchSchedule() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
