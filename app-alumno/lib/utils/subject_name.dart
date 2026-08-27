final _leadingParenthesizedSubjectCode = RegExp(
  r'^\s*\(\s*RC[^)]*\)\s*(?:[-–—|:]\s*)?',
  caseSensitive: false,
);

final _trailingParenthesizedSubjectCode = RegExp(
  r'(?:\s*[-–—|:]\s*)?\(\s*RC[^)]*\)\s*$',
  caseSensitive: false,
);

final _leadingDottedSubjectCode = RegExp(
  r'^\s*RC(?:[._/:\-][A-Z0-9]+)+(?=\s|[-–—|:]|$)'
  r'\s*(?:[-–—|:]\s*)?',
  caseSensitive: false,
);

final _trailingDottedSubjectCode = RegExp(
  r'(?:\s*[-–—|:]\s*)?RC(?:[._/:\-][A-Z0-9]+)+\s*$',
  caseSensitive: false,
);

final _leadingSubjectCode = RegExp(
  r'^\s*[\[(]?\s*RC\s*(?:[-_.:/]\s*)?\d+(?:\s*[-_.:/]\s*\d+)*\s*[\])]?'
  r'\s*(?:[-–—|:]\s*)?',
  caseSensitive: false,
);

final _trailingSubjectCode = RegExp(
  r'(?:\s*[-–—|:]\s*)?[\[(]?\s*RC\s*(?:[-_.:/]\s*)?\d+'
  r'(?:\s*[-_.:/]\s*\d+)*\s*[\])]?\s*$',
  caseSensitive: false,
);

/// Returns the subject name without an institutional code such as
/// `RC123456 -`, `RC.IT.06061.2873.5-5` or `(RC-123-456)`.
String subjectDisplayName(
  String? value, {
  String fallback = 'Materia sin nombre',
}) {
  final original = value?.trim() ?? '';
  if (original.isEmpty) return fallback;

  final withoutCode = original
      .replaceFirst(_leadingParenthesizedSubjectCode, '')
      .replaceFirst(_trailingParenthesizedSubjectCode, '')
      .replaceFirst(_leadingDottedSubjectCode, '')
      .replaceFirst(_trailingDottedSubjectCode, '')
      .replaceFirst(_leadingSubjectCode, '')
      .replaceFirst(_trailingSubjectCode, '')
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ');

  return withoutCode.isEmpty ? fallback : withoutCode;
}

/// Avoids displaying a complete institutional group code in the UI.
String? groupDisplayName(String? value) {
  final group = value?.trim();
  if (group == null || group.isEmpty) return null;
  if (!group.toUpperCase().startsWith('RC.')) return group;

  return RegExp(
    r'-([A-Z]{1,3})$',
    caseSensitive: false,
  ).firstMatch(group)?.group(1);
}
