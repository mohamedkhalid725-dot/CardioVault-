# Phase 1 — Clinical voice fields (staging)

## Mic-enabled fields
- History: Chief Complaint, Home Drug History, History of Present Illness (HPI), Family History, Social History & Habitus.
- Examination: every existing free-text examination narrative field; no numeric/select fields.
- Cardiology: existing narrative/comment fields such as Echo Other Findings, Echo Brief Summary, Coronary Angiography Findings, Intervention/PCI, and Cardiac Device Notes.
- ECG: Physician Interpretation / final impression.
- Imaging: Clinical Indication, Findings, Impression.
- Medication: Medication Indication / Notes narrative input where present.
- Orders / Consultations: Clinical question.
- Procedure: Indication, Technique / Details, Complications / Outcome.
- Progress Note: Subjective, Objective, Assessment, Plan.
- Handover: Situation, Background, Assessment, Recommendation.
- Quick Clinical Record: existing free-text clinical event/update narrative.

## Explicitly excluded
- Patient names, identifiers, MRN, addresses, phones.
- Numeric inputs, dates/times, doses, rates, lab values, vital signs.
- Dropdowns, checkboxes, search boxes, image/file pickers.

## ICU
The current ICU section exposes respiratory-support and ABG numeric/select controls but no existing ICU free-text narrative field. No new clinical field was invented in Phase 1, so no ICU mic control is added to a nonexistent field.

## Behavior
- Reusable VoiceDictationButton.
- One recording/AI request at a time globally.
- Hardened voice prompt and existing 429 countdown/fallback behavior retained.
- Draft shows transcription + editable Medical English.
- Draft label: "AI draft — review before saving".
- Insert appends to the existing field; never overwrites and never auto-saves.
- Fake/test data only; staging App Check enforcement remains enabled and debug mode remains off.
