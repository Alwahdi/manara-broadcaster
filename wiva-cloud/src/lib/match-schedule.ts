import { cleanText, HttpError } from "@/lib/security";

export function validateMatchScheduleInput(body: Record<string, unknown>) {
  const homeTeam = cleanText(body.homeTeam, 100);
  const awayTeam = cleanText(body.awayTeam, 100);
  const competition = cleanText(body.competition, 120);
  const channelName = cleanText(body.channelName, 120);
  const startsAt = new Date(cleanText(body.startsAt, 40));
  const endsAt = new Date(cleanText(body.endsAt, 40));
  if (!homeTeam || !awayTeam) throw new HttpError(400, "اكتب اسمي الفريقين");
  if (homeTeam.toLocaleLowerCase("ar") === awayTeam.toLocaleLowerCase("ar")) throw new HttpError(400, "يجب أن يكون الفريقان مختلفين");
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) throw new HttpError(400, "وقت المباراة غير صالح");
  const duration = endsAt.getTime() - startsAt.getTime();
  if (duration < 15 * 60_000 || duration > 12 * 60 * 60_000) throw new HttpError(400, "مدة المباراة يجب أن تكون بين 15 دقيقة و12 ساعة");
  const twoYears = 2 * 365 * 24 * 60 * 60_000;
  if (Math.abs(startsAt.getTime() - Date.now()) > twoYears) throw new HttpError(400, "تاريخ المباراة بعيد عن النطاق المسموح");
  return {
    homeTeam,
    awayTeam,
    competition,
    channelName,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    isActive: body.isActive === undefined ? true : body.isActive === true,
  };
}
