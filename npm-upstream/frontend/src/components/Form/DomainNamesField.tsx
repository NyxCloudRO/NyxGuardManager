import { Field, useFormikContext } from "formik";
import type { ReactNode } from "react";
import type { ActionMeta, MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { intl, T } from "src/locale";
import { validateDomain, validateDomains } from "src/modules/Validations";

type SelectOption = {
	label: string;
	value: string;
	color?: string;
};

interface Props {
	id?: string;
	maxDomains?: number;
	isWildcardPermitted?: boolean;
	dnsProviderWildcardSupported?: boolean;
	name?: string;
	label?: string;
	onChange?: (domains: string[]) => void;
}
export function DomainNamesField({
	name = "domainNames",
	label = "domain-names",
	id = "domainNames",
	maxDomains,
	isWildcardPermitted = false,
	dnsProviderWildcardSupported = false,
	onChange,
}: Props) {
	const { setFieldValue, setFieldTouched } = useFormikContext<any>();

	const handleChange = (v: MultiValue<SelectOption>, _actionMeta: ActionMeta<SelectOption>) => {
		const doms = v?.map((i: SelectOption) => {
			return i.value;
		});
		setFieldValue(name, doms);
		setFieldTouched(name, true, false);
		onChange?.(doms);
	};

	const helperTexts: ReactNode[] = [];
	if (maxDomains) {
		helperTexts.push(<T id="domain-names.max" data={{ count: maxDomains }} />);
	}
	if (!isWildcardPermitted) {
		helperTexts.push(<T id="domain-names.wildcards-not-permitted" />);
	} else if (!dnsProviderWildcardSupported) {
		helperTexts.push(<T id="domain-names.wildcards-not-supported" />);
	}

	return (
		<Field name={name} validate={validateDomains(isWildcardPermitted && dnsProviderWildcardSupported, maxDomains)}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label className="form-label" htmlFor={id}>
						<T id={label} />
					</label>
					<CreatableSelect
						className="react-select-container"
						classNamePrefix="react-select"
						name={field.name}
						id={id}
						menuPortalTarget={typeof document !== "undefined" ? document.body : null}
						menuPosition="fixed"
						menuShouldScrollIntoView={false}
						styles={{
							menuPortal: (base) => ({
								...base,
								zIndex: 9999,
							}),
							menu: (base) => ({
								...base,
								zIndex: 9999,
								backgroundColor: "rgba(15, 28, 62, 0.99)",
								border: "1px solid rgba(132, 165, 255, 0.28)",
								boxShadow: "0 16px 36px rgba(2, 6, 20, 0.72)",
								backdropFilter: "none",
								WebkitBackdropFilter: "none",
								overflow: "hidden",
							}),
							menuList: (base) => ({
								...base,
								maxHeight: 220,
								padding: "0.3rem",
								backgroundColor: "rgba(15, 28, 62, 0.99)",
							}),
							option: (base, state) => ({
								...base,
								minHeight: 32,
								display: "flex",
								alignItems: "center",
								fontWeight: 600,
								letterSpacing: "0.01em",
								lineHeight: 1.25,
								borderRadius: 8,
								margin: "0.08rem 0",
								padding: "8px 10px",
								textShadow: "none",
								background: state.isSelected
									? "rgba(56, 102, 228, 0.78)"
									: state.isFocused
										? "rgba(47, 85, 186, 0.68)"
										: "rgba(20, 38, 84, 0.98)",
								color: state.isDisabled
									? "rgba(184, 199, 235, 0.55)"
									: "rgba(245, 250, 255, 0.98)",
							}),
							noOptionsMessage: (base) => ({
								...base,
								color: "rgba(212, 224, 252, 0.9)",
							}),
						}}
						closeMenuOnSelect={true}
						isClearable={false}
						isValidNewOption={validateDomain(isWildcardPermitted && dnsProviderWildcardSupported)}
						isMulti
						placeholder={intl.formatMessage({ id: "domain-names.placeholder" })}
						onChange={handleChange}
						value={field.value?.map((d: string) => ({ label: d, value: d }))}
					/>
					{form.errors[field.name] ? (
						<small className="text-danger">{form.errors[field.name]}</small>
					) : helperTexts.length ? (
						helperTexts.map((i, idx) => (
							<small key={idx} className="text-info">
								{i}
							</small>
						))
					) : null}
				</div>
			)}
		</Field>
	);
}
