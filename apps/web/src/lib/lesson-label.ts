export function lessonLabel(
  number: number,
  subject: string | null | undefined,
) {
  return /^классный\s+час/i.test(subject?.trim() ?? '')
    ? 'Классный час'
    : `${number} пара`;
}
