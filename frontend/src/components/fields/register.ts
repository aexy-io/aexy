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

registerFieldType({ type: "text", label: "Text", view: TextFieldView, edit: TextFieldEdit });
registerFieldType({ type: "number", label: "Number", view: NumberFieldView, edit: NumberFieldEdit });
registerFieldType({ type: "currency", label: "Currency", view: CurrencyFieldView, edit: CurrencyFieldEdit });
registerFieldType({ type: "date", label: "Date", view: DateFieldView, edit: DateFieldEdit });
registerFieldType({ type: "datetime", label: "Date & Time", view: DatetimeFieldView, edit: DatetimeFieldEdit });
registerFieldType({ type: "checkbox", label: "Checkbox", view: CheckboxFieldView, edit: CheckboxFieldEdit });
registerFieldType({ type: "select", label: "Select", view: SelectFieldView, edit: SelectFieldEdit });
registerFieldType({ type: "status", label: "Status", view: SelectFieldView, edit: SelectFieldEdit });
registerFieldType({ type: "multi_select", label: "Multi Select", view: MultiSelectFieldView, edit: MultiSelectFieldEdit });
registerFieldType({ type: "email", label: "Email", view: EmailFieldView, edit: EmailFieldEdit });
registerFieldType({ type: "phone", label: "Phone", view: PhoneFieldView, edit: PhoneFieldEdit });
registerFieldType({ type: "url", label: "URL", view: UrlFieldView, edit: UrlFieldEdit });
registerFieldType({ type: "rating", label: "Rating", view: RatingFieldView, edit: RatingFieldEdit });
registerFieldType({ type: "record_reference", label: "Record Reference", view: RecordReferenceFieldView, edit: ReferenceFieldEdit });
registerFieldType({ type: "user_reference", label: "User Reference", view: UserReferenceFieldView, edit: ReferenceFieldEdit });
registerFieldType({ type: "formula", label: "Formula", view: FormulaFieldView, edit: ComputedFieldEdit });
registerFieldType({ type: "rollup", label: "Rollup", view: RollupFieldView, edit: ComputedFieldEdit });
registerFieldType({ type: "ai_computed", label: "AI Computed", view: AiComputedFieldView, edit: ComputedFieldEdit });
