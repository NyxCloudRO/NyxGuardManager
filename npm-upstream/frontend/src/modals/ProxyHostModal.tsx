import { IconSettings } from "@tabler/icons-react";
import cn from "classnames";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import {
	AccessField,
	Button,
	DomainNamesField,
	HasPermission,
	Loading,
	LocationsFields,
	NginxConfigField,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { validateNumber, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showProxyHostModal = (id: number | "new") => {
	EasyModal.show(ProxyHostModal, { id });
};

const parseMetaBool = (meta: any, camelKey: string, snakeKey: string): boolean | undefined => {
	const vCamel = meta?.[camelKey];
	if (typeof vCamel === "boolean") return vCamel;
	if (vCamel === 1 || vCamel === "1") return true;
	if (vCamel === 0 || vCamel === "0") return false;
	if (typeof vCamel === "string") {
		if (vCamel.toLowerCase() === "true") return true;
		if (vCamel.toLowerCase() === "false") return false;
	}
	const vSnake = meta?.[snakeKey];
	if (typeof vSnake === "boolean") return vSnake;
	if (vSnake === 1 || vSnake === "1") return true;
	if (vSnake === 0 || vSnake === "0") return false;
	if (typeof vSnake === "string") {
		if (vSnake.toLowerCase() === "true") return true;
		if (vSnake.toLowerCase() === "false") return false;
	}
	return undefined;
};

interface Props extends InnerModalProps {
	id: number | "new";
}

const firstFormikError = (errors: any): string | null => {
	if (!errors || typeof errors !== "object") return null;
	for (const value of Object.values(errors)) {
		if (typeof value === "string" && value.trim()) return value;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (typeof item === "string" && item.trim()) return item;
				const nested = firstFormikError(item);
				if (nested) return nested;
			}
		} else if (value && typeof value === "object") {
			const nested = firstFormikError(value);
			if (nested) return nested;
		}
	}
	return null;
};

const firstFormikErrorPath = (errors: any, prefix = ""): string | null => {
	if (!errors || typeof errors !== "object") return null;
	for (const [key, value] of Object.entries(errors)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string" && value.trim()) return path;
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				const item = value[i];
				const itemPath = `${path}.${i}`;
				if (typeof item === "string" && item.trim()) return itemPath;
				const nested = firstFormikErrorPath(item, itemPath);
				if (nested) return nested;
			}
		} else if (value && typeof value === "object") {
			const nested = firstFormikErrorPath(value, path);
			if (nested) return nested;
		}
	}
	return null;
};

const touchAllFields = (value: any): any => {
	if (Array.isArray(value)) return value.map((item) => touchAllFields(item));
	if (value && typeof value === "object") {
		return Object.keys(value).reduce((acc: any, key) => {
			acc[key] = touchAllFields(value[key]);
			return acc;
		}, {});
	}
	return true;
};

const getTabForErrorPath = (path: string | null): string => {
	if (!path) return "#tab-details";
	if (path.startsWith("certificateId") || path.startsWith("sslForced") || path.startsWith("http2Support") || path.startsWith("hstsEnabled") || path.startsWith("hstsSubdomains")) {
		return "#tab-ssl";
	}
	if (path.startsWith("locations")) return "#tab-locations";
	if (path.startsWith("advancedConfig")) return "#tab-advanced";
	if (path.startsWith("meta.") && !path.startsWith("meta.nyxguardAppName")) return "#tab-protection";
	return "#tab-details";
};

const activateTab = (href: string) => {
	if (typeof document === "undefined") return;
	const tabLink = document.querySelector(`a.nav-link[href="${href}"]`) as HTMLAnchorElement | null;
	tabLink?.click();
};

const ProxyHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setProxyHost(payload, {
			onError: (err: any) => {
				const message =
					err instanceof Error
						? err.message
						: typeof err?.message === "string"
							? err.message
							: "Unable to save proxy host.";
				setErrorMsg(message);
			},
			onSuccess: () => {
				showObjectSuccess("proxy-host", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && (error || userError) && (
				<Alert variant="danger" className="m-3">
					{error?.message || userError?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading || (userIsLoading && <Loading noLogo />)}
			{!isLoading && !userIsLoading && data && currentUser && (
				<Formik
					initialValues={
						{
							domainNames: data?.domainNames || [],
							forwardScheme: data?.forwardScheme || "http",
							forwardHost: data?.forwardHost || "",
							forwardPort: data?.forwardPort || undefined,
							accessListId: data?.accessListId || 0,
							cachingEnabled: data?.cachingEnabled || false,
							blockExploits: data?.blockExploits || false,
							allowWebsocketUpgrade: data?.allowWebsocketUpgrade || false,
							meta: {
								...(data?.meta || {}),
								nyxguardAppName:
									typeof data?.meta?.nyxguardAppName === "string"
										? data.meta.nyxguardAppName
										: typeof data?.meta?.nyxguard_app_name === "string"
											? data.meta.nyxguard_app_name
											: "",
								nyxguardWafEnabled: parseMetaBool(data?.meta, "nyxguardWafEnabled", "nyxguard_waf_enabled") ?? false,
								nyxguardBotDefenseEnabled:
									parseMetaBool(data?.meta, "nyxguardBotDefenseEnabled", "nyxguard_bot_defense_enabled") ?? false,
								nyxguardDdosEnabled: parseMetaBool(data?.meta, "nyxguardDdosEnabled", "nyxguard_ddos_enabled") ?? false,
								nyxguardSqliEnabled: parseMetaBool(data?.meta, "nyxguardSqliEnabled", "nyxguard_sqli_enabled") ?? false,
								// Bypass defaults to false — OFF is the secure default (all traffic checked, bans enforced).
								nyxguardAuthBypassEnabled:
									parseMetaBool(data?.meta, "nyxguardAuthBypassEnabled", "nyxguard_auth_bypass_enabled") ??
									false,
							},
							locations: data?.locations || [],
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							http2Support: data?.http2Support || false,
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							advancedConfig: data?.advancedConfig || "",
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ values, validateForm, setTouched, submitForm }) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "proxy-host" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0">
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<div className="card m-0 border-0">
									<div className="card-header">
										<ul className="nav nav-tabs card-header-tabs" data-bs-toggle="tabs">
											<li className="nav-item" role="presentation">
												<a href="#tab-details" className="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab">
													<T id="column.details" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a href="#tab-protection" className="nav-link" data-bs-toggle="tab" aria-selected="false" tabIndex={-1} role="tab">
													<T id="proxy-host.protection" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a href="#tab-locations" className="nav-link" data-bs-toggle="tab" aria-selected="false" tabIndex={-1} role="tab">
													<T id="column.custom-locations" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a href="#tab-ssl" className="nav-link" data-bs-toggle="tab" aria-selected="false" tabIndex={-1} role="tab">
													<T id="column.ssl" />
												</a>
											</li>
											<li className="nav-item ms-auto" role="presentation">
												<a href="#tab-advanced" className="nav-link" title="Settings" data-bs-toggle="tab" aria-selected="false" tabIndex={-1} role="tab">
													<IconSettings size={20} />
												</a>
											</li>
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											<div className="tab-pane active show" id="tab-details" role="tabpanel">
												<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
												<Field name="meta.nyxguardAppName" validate={validateString(0, 120)}>
													{({ field, form }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="nyxguardAppName"><T id="proxy-host.app-name" /></label>
															<input
																id="nyxguardAppName"
																type="text"
																className={`form-control ${form.errors?.meta?.nyxguardAppName && form.touched?.meta?.nyxguardAppName ? "is-invalid" : ""}`}
																placeholder={intl.formatMessage({ id: "proxy-host.app-name.placeholder" })}
																{...field}
															/>
															{form.errors?.meta?.nyxguardAppName ? <div className="invalid-feedback">{form.errors.meta.nyxguardAppName}</div> : null}
														</div>
													)}
												</Field>
												<div className="row">
													<div className="col-md-3">
														<Field name="forwardScheme">
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardScheme">{intl.formatMessage({ id: "host.forward-scheme" })}</label>
																	<select id="forwardScheme" className={`form-control ${form.errors.forwardScheme && form.touched.forwardScheme ? "is-invalid" : ""}`} required {...field}>
																		<option value="http">http</option>
																		<option value="https">https</option>
																	</select>
																	{form.errors.forwardScheme ? <div className="invalid-feedback">{form.touched.forwardScheme ? form.errors.forwardScheme : null}</div> : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-6">
														<Field name="forwardHost" validate={validateString(1, 255)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardHost">{intl.formatMessage({ id: "proxy-host.forward-host" })}</label>
																	<input id="forwardHost" type="text" className={`form-control ${form.errors.forwardHost && form.touched.forwardHost ? "is-invalid" : ""}`} required placeholder="example.com" {...field} />
																	{form.errors.forwardHost ? <div className="invalid-feedback">{form.touched.forwardHost ? form.errors.forwardHost : null}</div> : null}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-3">
														<Field name="forwardPort" validate={validateNumber(1, 65535)}>
															{({ field, form }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="forwardPort">{intl.formatMessage({ id: "host.forward-port" })}</label>
																	<input id="forwardPort" type="number" min={1} max={65535} className={`form-control ${form.errors.forwardPort && form.touched.forwardPort ? "is-invalid" : ""}`} required placeholder="eg: 8081" {...field} />
																	{form.errors.forwardPort ? <div className="invalid-feedback">{form.touched.forwardPort ? form.errors.forwardPort : null}</div> : null}
																</div>
															)}
														</Field>
													</div>
												</div>
												<AccessField />
											</div>

											<div className="tab-pane" id="tab-protection" role="tabpanel">
												<div className="mb-3">
													<h4 className="py-2"><T id="options" /></h4>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="cachingEnabled">
																<span className="col"><T id="host.flags.cache-assets" /></span>
																<span className="col-auto">
																	<Field name="cachingEnabled" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input {...field} id="cachingEnabled" className={cn("form-check-input", { "bg-lime": field.checked })} type="checkbox" />
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="blockExploits">
																<span className="col"><T id="host.flags.block-exploits" /></span>
																<span className="col-auto">
																	<Field name="blockExploits" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input {...field} id="blockExploits" className={cn("form-check-input", { "bg-lime": field.checked })} type="checkbox" />
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="allowWebsocketUpgrade">
																<span className="col"><T id="host.flags.websockets-upgrade" /></span>
																<span className="col-auto">
																	<Field name="allowWebsocketUpgrade" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input {...field} id="allowWebsocketUpgrade" className={cn("form-check-input", { "bg-lime": field.checked })} type="checkbox" />
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
													</div>
												</div>

												<div className="mb-3">
													<h4 className="py-2"><T id="proxy-host.protection" /></h4>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="nyxguardWafEnabled">
																<span className="col"><T id="proxy-host.enable-waf" /></span>
																<span className="col-auto">
																	<Field name="meta.nyxguardWafEnabled" type="checkbox">
																		{({ field, form }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					{...field}
																					id="nyxguardWafEnabled"
																					className={cn("form-check-input", { "bg-lime": field.checked })}
																					type="checkbox"
																					onChange={(e) => {
																						const checked = e.target.checked;
																						form.setFieldValue(field.name, checked);
																						if (!checked) {
																							form.setFieldValue("meta.nyxguardBotDefenseEnabled", false);
																							form.setFieldValue("meta.nyxguardDdosEnabled", false);
																							form.setFieldValue("meta.nyxguardSqliEnabled", false);
																							form.setFieldValue("meta.nyxguardAuthBypassEnabled", false);
																						}
																					}}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>

														<div>
															<Field name="meta.nyxguardWafEnabled">
																{({ field: wafField }: any) => (
																	<label className="row" htmlFor="nyxguardBotDefenseEnabled">
																		<span className="col"><T id="proxy-host.enable-bot" /></span>
																		<span className="col-auto">
																			<Field name="meta.nyxguardBotDefenseEnabled" type="checkbox">
																				{({ field }: any) => (
																					<label className="form-check form-check-single form-switch">
																						<input {...field} id="nyxguardBotDefenseEnabled" className={cn("form-check-input", { "bg-lime": field.checked })} type="checkbox" disabled={!wafField.value} />
																					</label>
																				)}
																			</Field>
																		</span>
																	</label>
																)}
															</Field>
														</div>

														<div>
															<Field name="meta.nyxguardWafEnabled">
																{({ field: wafField }: any) => (
																	<label className="row" htmlFor="nyxguardDdosEnabled">
																		<span className="col"><T id="proxy-host.enable-ddos" /></span>
																		<span className="col-auto">
																			<Field name="meta.nyxguardDdosEnabled" type="checkbox">
																				{({ field }: any) => (
																					<label className="form-check form-check-single form-switch">
																						<input {...field} id="nyxguardDdosEnabled" className={cn("form-check-input", { "bg-lime": field.checked })} type="checkbox" disabled={!wafField.value} />
																					</label>
																				)}
																			</Field>
																		</span>
																	</label>
																)}
															</Field>
														</div>

														<div>
															<Field name="meta.nyxguardWafEnabled">
																{({ field: wafField }: any) => (
																	<label className="row" htmlFor="nyxguardSqliEnabled">
																		<span className="col"><T id="proxy-host.enable-sql" /></span>
																		<span className="col-auto">
																			<Field name="meta.nyxguardSqliEnabled" type="checkbox">
																				{({ field }: any) => (
																					<label className="form-check form-check-single form-switch">
																						<input {...field} id="nyxguardSqliEnabled" className={cn("form-check-input", { "bg-lime": field.checked })} type="checkbox" disabled={!wafField.value} />
																					</label>
																				)}
																			</Field>
																		</span>
																	</label>
																)}
															</Field>
														</div>

														<div>
															<Field name="meta.nyxguardWafEnabled">
																{({ field: wafField }: any) => (
																	<label className="row" htmlFor="nyxguardAuthBypassEnabled">
																		<span className="col"><T id="proxy-host.enable-auth-bypass" /></span>
																		<span className="col-auto">
																			<Field name="meta.nyxguardAuthBypassEnabled" type="checkbox">
																				{({ field }: any) => (
																					<label className="form-check form-check-single form-switch">
																						<input {...field} id="nyxguardAuthBypassEnabled" className={cn("form-check-input", { "bg-lime": field.checked })} type="checkbox" disabled={!wafField.value} />
																					</label>
																				)}
																			</Field>
																		</span>
																	</label>
																)}
															</Field>
														</div>
													</div>
												</div>
											</div>

											<div className="tab-pane" id="tab-locations" role="tabpanel">
												<LocationsFields initialValues={data?.locations || []} />
											</div>
											<div className="tab-pane" id="tab-ssl" role="tabpanel">
												<SSLCertificateField name="certificateId" label="ssl-certificate" allowNew />
												<SSLOptionsFields color="bg-lime" />
											</div>
											<div className="tab-pane" id="tab-advanced" role="tabpanel">
												<NginxConfigField />
											</div>
										</div>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
									<Button
										type="button"
										actionType="primary"
										className="ms-auto bg-lime"
										isLoading={isSubmitting}
										disabled={isSubmitting}
										onClick={async () => {
											const errors = await validateForm();
											if (errors && Object.keys(errors).length > 0) {
												await setTouched(touchAllFields(values), true);
												const path = firstFormikErrorPath(errors);
												activateTab(getTabForErrorPath(path));
												setErrorMsg(firstFormikError(errors) || intl.formatMessage({ id: "error.required" }));
												return;
											}
											submitForm();
										}}
									>
										<T id="save" />
									</Button>
								</HasPermission>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

export { showProxyHostModal };
