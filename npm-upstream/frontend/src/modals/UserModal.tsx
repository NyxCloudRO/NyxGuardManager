import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { setPermissions, type UserPermissions } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useSetUser, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showUserModal = (id: number | "me" | "new") => {
	EasyModal.show(UserModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me" | "new";
}
const UserModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useUser(id);
	const { data: currentUser, isLoading: currentIsLoading } = useUser("me");
	const { mutate: setUser } = useSetUser();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isNyxAgentUser = (p?: UserPermissions | null) => {
		if (!p) return false;
		return (
			p.visibility === "all" &&
			p.proxyHosts === "view" &&
			p.redirectionHosts === "view" &&
			p.deadHosts === "view" &&
			p.streams === "view" &&
			p.accessLists === "view" &&
			p.certificates === "view"
		);
	};

	const NYX_AGENT_PERMS: UserPermissions = {
		visibility: "all",
		proxyHosts: "view",
		redirectionHosts: "view",
		deadHosts: "view",
		streams: "view",
		accessLists: "view",
		certificates: "view",
	};

	const STANDARD_USER_PERMS: UserPermissions = {
		visibility: "user",
		proxyHosts: "manage",
		redirectionHosts: "manage",
		deadHosts: "manage",
		streams: "manage",
		accessLists: "manage",
		certificates: "manage",
	};

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const wantNyxAgent = !!values.isNyxAgent;
		const { ...payload } = {
			id: id === "new" ? undefined : id,
			roles: [],
			...values,
		};

		if (data?.id === currentUser?.id) {
			// Prevent user from locking themselves out
			delete payload.isDisabled;
			delete payload.roles;
		} else if (payload.isAdmin) {
			payload.roles = ["admin"];
		}

		// this isn't a real field, just for the form
		delete payload.isAdmin;
		delete payload.isNyxAgent;

		setUser(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: async (saved: any) => {
				try {
					// Apply NyxAgent permissions after saving (API doesn't accept permissions in /users payload).
					// NyxAgent is "monitor only": view access across all resources + visibility=all.
					if (data?.id !== currentUser?.id && !payload.roles?.includes?.("admin")) {
						const wasNyxAgent = isNyxAgentUser(data?.permissions);
						if (wantNyxAgent) {
							await setPermissions(saved.id, NYX_AGENT_PERMS);
						} else if (wasNyxAgent) {
							// If unchecking NyxAgent, revert to default standard-user permissions.
							await setPermissions(saved.id, STANDARD_USER_PERMS);
						}
					}
					showObjectSuccess("user", "saved");
					remove();
				} catch (err: any) {
					setErrorMsg(err?.message || "Unable to apply NyxAgent permissions.");
				}
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{(isLoading || currentIsLoading) && <Loading noLogo />}
			{!isLoading && !currentIsLoading && data && currentUser && (
				<Formik
					initialValues={
						{
							name: data?.name,
							nickname: data?.nickname,
							email: data?.email,
							isAdmin: data?.roles?.includes("admin"),
							isNyxAgent: !data?.roles?.includes("admin") && isNyxAgentUser(data?.permissions),
							isDisabled: data?.isDisabled,
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ values, setFieldValue }) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "user" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<div className="row">
									<div className="col-lg-6">
										<div className="mb-3">
											<Field name="name" validate={validateString(1, 50)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="name"
															className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
															placeholder={intl.formatMessage({ id: "user.full-name" })}
															{...field}
														/>
														<label htmlFor="name">
															<T id="user.full-name" />
														</label>
														{form.errors.name ? (
															<div className="invalid-feedback">
																{form.errors.name && form.touched.name
																	? form.errors.name
																	: null}
															</div>
														) : null}
													</div>
												)}
											</Field>
										</div>
									</div>
									<div className="col-lg-6">
										<div className="mb-3">
											<Field name="nickname" validate={validateString(1, 30)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="nickname"
															className={`form-control ${form.errors.nickname && form.touched.nickname ? "is-invalid" : ""}`}
															placeholder={intl.formatMessage({ id: "user.nickname" })}
															{...field}
														/>
														<label htmlFor="nickname">
															<T id="user.nickname" />
														</label>
														{form.errors.nickname ? (
															<div className="invalid-feedback">
																{form.errors.nickname && form.touched.nickname
																	? form.errors.nickname
																	: null}
															</div>
														) : null}
													</div>
												)}
											</Field>
										</div>
									</div>
								</div>
								<div className="mb-3">
									<Field name="email" validate={validateEmail()}>
										{({ field, form }: any) => (
											<div className="form-floating mb-3">
												<input
													id="email"
													type="email"
													className={`form-control ${form.errors.email && form.touched.email ? "is-invalid" : ""}`}
													placeholder={intl.formatMessage({ id: "email-address" })}
													{...field}
												/>
												<label htmlFor="email">
													<T id="email-address" />
												</label>
												{form.errors.email ? (
													<div className="invalid-feedback">
														{form.errors.email && form.touched.email
															? form.errors.email
															: null}
													</div>
												) : null}
											</div>
										)}
									</Field>
								</div>
								{currentUser && data && currentUser?.id !== data?.id ? (
									<div className="my-3">
										<h4 className="py-2">
											<T id="options" />
										</h4>
										<div className="divide-y">
											<div>
												<label className="row" htmlFor="isAdmin">
													<span className="col">
														<T id="role.admin" />
													</span>
													<span className="col-auto">
														<Field name="isAdmin" type="checkbox">
															{({ field }: any) => (
																<label className="form-check form-check-single form-switch">
																	<input
																		{...field}
																		id="isAdmin"
																		className="form-check-input"
																		type="checkbox"
																		onChange={(e) => {
																			const checked = e.target.checked;
																			setFieldValue("isAdmin", checked);
																			if (checked) setFieldValue("isNyxAgent", false);
																		}}
																	/>
																</label>
															)}
														</Field>
													</span>
												</label>
											</div>
											<div>
												<label className="row" htmlFor="isNyxAgent">
													<span className="col">NyxAgent (Monitoring only)</span>
													<span className="col-auto">
														<Field name="isNyxAgent" type="checkbox">
															{({ field }: any) => (
																<label className="form-check form-check-single form-switch">
																	<input
																		{...field}
																		id="isNyxAgent"
																		className="form-check-input"
																		type="checkbox"
																		disabled={!!values.isAdmin}
																		onChange={(e) => {
																			const checked = e.target.checked;
																			setFieldValue("isNyxAgent", checked);
																			if (checked) setFieldValue("isAdmin", false);
																		}}
																	/>
																</label>
															)}
														</Field>
													</span>
												</label>
											</div>
											<div>
												<label className="row" htmlFor="isDisabled">
													<span className="col">
														<T id="disabled" />
													</span>
													<span className="col-auto">
														<Field name="isDisabled" type="checkbox">
															{({ field }: any) => (
																<label className="form-check form-check-single form-switch">
																	<input
																		{...field}
																		id="isDisabled"
																		className="form-check-input"
																		type="checkbox"
																	/>
																</label>
															)}
														</Field>
													</span>
												</label>
											</div>
										</div>
									</div>
								) : null}
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									className="ms-auto btn-orange"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

export { showUserModal };
