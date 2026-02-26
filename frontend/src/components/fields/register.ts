/**
 * Registers all built-in field types into the field registry.
 * Import this module once at app startup (or in any component that uses FieldRenderer).
 */
import { registerFieldType } from "./registry";

import { TextFieldView, TextFieldEdit } from "./types/TextField";
import { NumberFieldView, NumberFieldEdit } from "./types/NumberField";
import { CurrencyFieldView, CurrencyFieldEdit } from "./types/CurrencyField";
import { DateFieldView, DateFieldEdit, DatetimeFieldView, DatetimeFieldEdit } from "./types/DateField";
import { CheckboxFieldView, CheckboxFieldEdit } from "./types/CheckboxField";
import { SelectFieldView, SelectFieldEdit } from "./types/SelectField";
import { MultiSelectFieldView, MultiSelectFieldEdit } from "./types/MultiSelectField";
import { EmailFieldView, EmailFieldEdit } from "./types/EmailField";
import { PhoneFieldView, PhoneFieldEdit } from "./types/PhoneField";
import { UrlFieldView, UrlFieldEdit } from "./types/UrlField";
import { RatingFieldView, RatingFieldEdit } from "./types/RatingField";
import { TextareaFieldView, TextareaFieldEdit } from "./types/TextareaField";
import { RecordReferenceFieldView, UserReferenceFieldView, ReferenceFieldEdit } from "./types/ReferenceField";
import { FormulaFieldView, RollupFieldView, AiComputedFieldView, ComputedFieldEdit } from "./types/ComputedField";
import { FileFieldView, FileFieldEdit } from "./types/FileField";

registerFieldType({
  type: "text",
  label: "Text",
  view: TextFieldView,
  edit: TextFieldEdit,
  variants: [
    { id: "plain", label: "Plain" },
    { id: "truncated", label: "Truncated" },
  ],
});

registerFieldType({
  type: "number",
  label: "Number",
  view: NumberFieldView,
  edit: NumberFieldEdit,
  variants: [
    { id: "plain", label: "Plain" },
    { id: "progress_bar", label: "Progress Bar", description: "Show as a filled bar" },
    { id: "colored_badge", label: "Colored Badge", description: "Green for positive, red for negative" },
  ],
  defaultVariant: { table_cell: "plain", highlights: "plain" },
});

registerFieldType({
  type: "currency",
  label: "Currency",
  view: CurrencyFieldView,
  edit: CurrencyFieldEdit,
  variants: [
    { id: "plain", label: "Plain" },
    { id: "colored", label: "Colored (+/-)", description: "Green for positive, red for negative" },
    { id: "abbreviated", label: "Abbreviated", description: "$1.2M, $500K" },
  ],
  defaultVariant: { table_cell: "plain", detail_view: "colored" },
});

registerFieldType({
  type: "date",
  label: "Date",
  view: DateFieldView,
  edit: DateFieldEdit,
  variants: [
    { id: "relative", label: "Relative", description: "2 days ago, in 3 weeks" },
    { id: "absolute", label: "Absolute", description: "Feb 25, 2026" },
    { id: "short", label: "Short", description: "Feb 25" },
    { id: "full", label: "Full", description: "February 25, 2026" },
  ],
  defaultVariant: { table_cell: "relative", detail_view: "absolute" },
});

registerFieldType({
  type: "datetime",
  label: "Date & Time",
  view: DatetimeFieldView,
  edit: DatetimeFieldEdit,
  variants: [
    { id: "relative", label: "Relative" },
    { id: "full", label: "Full" },
  ],
  defaultVariant: { table_cell: "relative", detail_view: "full" },
});

registerFieldType({
  type: "checkbox",
  label: "Checkbox",
  view: CheckboxFieldView,
  edit: CheckboxFieldEdit,
  variants: [
    { id: "check_icon", label: "Check Icon" },
    { id: "toggle", label: "Toggle Switch" },
    { id: "yes_no", label: "Yes / No" },
    { id: "colored_dot", label: "Colored Dot" },
  ],
  defaultVariant: { table_cell: "check_icon", detail_view: "toggle" },
});

registerFieldType({
  type: "select",
  label: "Select",
  view: SelectFieldView,
  edit: SelectFieldEdit,
  variants: [
    { id: "pill", label: "Pill Badge" },
    { id: "dot_label", label: "Dot + Label" },
    { id: "text_only", label: "Text Only" },
    { id: "colored_bg", label: "Colored Background" },
  ],
  defaultVariant: { table_cell: "pill", detail_view: "pill" },
});

registerFieldType({
  type: "status",
  label: "Status",
  view: SelectFieldView,
  edit: SelectFieldEdit,
  variants: [
    { id: "pill", label: "Pill Badge" },
    { id: "dot_label", label: "Dot + Label" },
    { id: "colored_bg", label: "Colored Background" },
  ],
});

registerFieldType({
  type: "multi_select",
  label: "Multi Select",
  view: MultiSelectFieldView,
  edit: MultiSelectFieldEdit,
  variants: [
    { id: "pills", label: "Pill Badges" },
    { id: "comma_text", label: "Comma Text" },
    { id: "count_badge", label: "Count Badge" },
  ],
});

registerFieldType({
  type: "email",
  label: "Email",
  view: EmailFieldView,
  edit: EmailFieldEdit,
  variants: [
    { id: "link", label: "Email Link" },
    { id: "avatar_chip", label: "Avatar Chip" },
  ],
});
registerFieldType({
  type: "phone",
  label: "Phone",
  view: PhoneFieldView,
  edit: PhoneFieldEdit,
  variants: [
    { id: "plain", label: "Plain" },
    { id: "formatted", label: "Formatted" },
  ],
});
registerFieldType({
  type: "url",
  label: "URL",
  view: UrlFieldView,
  edit: UrlFieldEdit,
  variants: [
    { id: "link", label: "URL Link" },
    { id: "favicon_link", label: "Favicon Link" },
  ],
});
registerFieldType({
  type: "textarea",
  label: "Long Text",
  view: TextareaFieldView,
  edit: TextareaFieldEdit,
  variants: [
    { id: "plain", label: "Plain Text" },
    { id: "markdown", label: "Markdown" },
  ],
});

registerFieldType({
  type: "rating",
  label: "Rating",
  view: RatingFieldView,
  edit: RatingFieldEdit,
  variants: [
    { id: "stars", label: "Stars" },
    { id: "hearts", label: "Hearts" },
    { id: "dots", label: "Dots" },
    { id: "numeric", label: "Numeric (3/5)" },
  ],
  defaultVariant: { table_cell: "stars", detail_view: "stars" },
});

registerFieldType({ type: "record_reference", label: "Record Reference", view: RecordReferenceFieldView, edit: ReferenceFieldEdit });
registerFieldType({ type: "user_reference", label: "User Reference", view: UserReferenceFieldView, edit: ReferenceFieldEdit });
registerFieldType({ type: "formula", label: "Formula", view: FormulaFieldView, edit: ComputedFieldEdit });
registerFieldType({ type: "rollup", label: "Rollup", view: RollupFieldView, edit: ComputedFieldEdit });
registerFieldType({ type: "ai_computed", label: "AI Computed", view: AiComputedFieldView, edit: ComputedFieldEdit });
registerFieldType({ type: "file" as any, label: "File", view: FileFieldView, edit: FileFieldEdit });
