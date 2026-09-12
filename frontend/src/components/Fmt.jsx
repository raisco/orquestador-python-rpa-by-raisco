import React from "react";
import { fmtDateTime, fmtDuration } from "../lib/format";
import EmptyValue from "./EmptyValue";

/**
 * Wrappers de los formatters de lib/format.js que devuelven <EmptyValue />
 * (atenuado) en vez del "—" plano cuando no hay dato. Un solo lugar para
 * este chequeo, en vez de repetirlo en cada tabla.
 */
export function FmtDateTime({ iso }) {
  return iso ? fmtDateTime(iso) : <EmptyValue />;
}

export function FmtDuration({ seconds }) {
  return seconds == null || Number.isNaN(Number(seconds)) ? <EmptyValue /> : fmtDuration(seconds);
}
