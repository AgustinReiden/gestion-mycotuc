import { afterEach, describe, expect, it } from "vitest";
import { escapeLikePattern } from "../src/lib/search";
import { formatDate, parseCalendarDate, todayISO } from "../src/lib/utils";

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
