import { afterEach, describe, expect, it } from "vitest";
import { escapeLikePattern } from "../src/lib/search";
import {
  addCalendarDays,
  formatDate,
  formatInstantDate,
  formatMonthLabel,
  getBusinessMonth,
  parseCalendarDate,
  toBusinessDateISO,
  todayISO,
} from "../src/lib/utils";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("formatDate", () => {
  it("no corre el día para fechas yyyy-mm-dd", () => {
    expect(formatDate("2026-11-03")).toBe("03 nov 2026");
  });

  it("no corre el día para timestamps guardados a medianoche UTC", () => {
    expect(formatDate("2026-11-03T00:00:00+00:00")).toBe("03 nov 2026");
    expect(formatDate("2026-11-03T00:00:00.000Z")).toBe("03 nov 2026");
    expect(formatDate("2026-11-03 00:00:00+00")).toBe("03 nov 2026");
  });

  it("devuelve guion para valores vacíos o inválidos", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
    expect(formatDate("")).toBe("-");
    expect(formatDate("no es una fecha")).toBe("-");
    expect(formatDate("2026-13-45")).toBe("-");
  });

  it("acepta un formato personalizado", () => {
    expect(formatDate("2026-11-03", "d 'de' MMMM")).toBe("3 de noviembre");
  });

  it.each([
    "America/Argentina/Buenos_Aires",
    "UTC",
    "Pacific/Auckland",
    "America/Los_Angeles",
  ])("muestra el mismo día con TZ=%s", (timeZone) => {
    process.env.TZ = timeZone;

    expect(formatDate("2026-11-03")).toBe("03 nov 2026");
    expect(formatDate("2026-11-03T00:00:00+00:00")).toBe("03 nov 2026");
    expect(parseCalendarDate("2026-11-03")?.getDate()).toBe(3);
  });
});

describe("todayISO", () => {
  it("usa el día local y no el de UTC", () => {
    process.env.TZ = "America/Argentina/Buenos_Aires";

    // 21:30 en Buenos Aires del 3/11 ya es el 4/11 en UTC.
    expect(todayISO(new Date(2026, 10, 3, 21, 30))).toBe("2026-11-03");
  });
});

describe("fechas en hora argentina", () => {
  it.each(["UTC", "America/Argentina/Buenos_Aires", "Pacific/Auckland", "America/Los_Angeles"])(
    "el último día del mes a las 23:30 sigue siendo ese mes con TZ=%s",
    (timeZone) => {
      process.env.TZ = timeZone;
      const instant = new Date("2026-11-30T23:30:00-03:00");

      expect(todayISO(instant)).toBe("2026-11-30");
      expect(toBusinessDateISO(instant)).toBe("2026-11-30");
      expect(getBusinessMonth(instant)).toEqual({
        month: "2026-11",
        today: "2026-11-30",
        start: "2026-11-01",
        end: "2026-11-30",
      });
      expect(formatMonthLabel(instant)).toBe("noviembre 2026");
    },
  );

  it("pasa de mes a la medianoche argentina, no a la de UTC", () => {
    expect(getBusinessMonth(new Date("2026-12-01T02:59:00Z")).month).toBe("2026-11");
    expect(getBusinessMonth(new Date("2026-12-01T03:00:00Z")).month).toBe("2026-12");
    expect(getBusinessMonth(new Date("2026-12-01T03:00:00Z")).start).toBe("2026-12-01");
  });

  it("calcula el último día del mes, incluso en años bisiestos", () => {
    expect(getBusinessMonth(new Date("2028-02-10T12:00:00Z")).end).toBe("2028-02-29");
    expect(getBusinessMonth(new Date("2026-02-10T12:00:00Z")).end).toBe("2026-02-28");
    expect(getBusinessMonth(new Date("2026-12-10T12:00:00Z")).end).toBe("2026-12-31");
  });

  it("suma y resta días calendario sin correrse", () => {
    expect(addCalendarDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addCalendarDays("2026-03-01", -30)).toBe("2026-01-30");
    expect(addCalendarDays("2026-12-31", 0)).toBe("2026-12-31");
  });

  it("muestra un instante con el día argentino", () => {
    process.env.TZ = "UTC";
    expect(formatInstantDate("2026-11-06T02:30:00+00:00")).toBe("05/11/2026");
    expect(formatInstantDate("2026-11-05T15:00:00Z")).toBe("05/11/2026");
    expect(formatInstantDate(null)).toBe("-");
    expect(formatInstantDate("no es una fecha")).toBe("-");
  });
});

describe("escapeLikePattern", () => {
  it("escapa %, _ y la barra invertida", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("%_\\")).toBe("\\%\\_\\\\");
  });

  it("deja intacto el texto sin comodines", () => {
    expect(escapeLikePattern("Cliente N/A")).toBe("Cliente N/A");
    expect(escapeLikePattern("")).toBe("");
  });
});
