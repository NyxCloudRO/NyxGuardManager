import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { clearUserAvatar, setPermissions, type UserPermissions, uploadUserAvatar } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useSetUser, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import { showError, showObjectSuccess, showSuccess } from "src/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const showUserModal = (id: number | "me" | "new") => {
	EasyModal.show(UserModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me" | "new";
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

const UserModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useUser(id);
	const { data: currentUser, isLoading: currentIsLoading } = useUser("me");
	const { mutate: setUser } = useSetUser();
	const qc = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

	const mergeUserCache = (queryKey: (string | number)[], updated: any) => {
		qc.setQueryData(queryKey, (prev: any) => {
			if (!prev) return updated;
			return {
				...prev,
				...updated,
				// Preserve permission/role shape if avatar endpoint returns partial payload.
				roles: Array.isArray(updated?.roles) ? updated.roles : prev.roles,
				permissions: updated?.permissions ?? prev.permissions,
			};
		});
	};

	const isCustomAvatar = useMemo(() => {
		const a = data?.avatar || "";
		return a.startsWith("/api/avatar/") || a.startsWith("/avatar/");
	}, [data?.avatar]);

	useEffect(() => {
		if (!avatarFile) {
			setAvatarPreview(null);
			return;
		}
		const u = URL.createObjectURL(avatarFile);
		setAvatarPreview(u);
		return () => URL.revokeObjectURL(u);
	}, [avatarFile]);

	const avatarUpload = useMutation({
		mutationFn: async (file: File) => {
			if (!data?.id) throw new Error("User must be saved before uploading an avatar.");
			return uploadUserAvatar(data.id, file);
		},
		onSuccess: async (updated) => {
			setAvatarFile(null);
			setAvatarPreview(null);
			mergeUserCache(["user", id], updated);
			if (updated.id === currentUser?.id) {
				mergeUserCache(["user", "me"], updated);
			}
			await qc.invalidateQueries({ queryKey: ["user", id] });
			await qc.invalidateQueries({ queryKey: ["user", "me"] });
			await qc.invalidateQueries({ queryKey: ["users"] });
			await qc.invalidateQueries({ queryKey: ["audit-logs"] });
			showSuccess("Profile picture updated.");
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : "Failed to upload profile picture.");
		},
	});

	const avatarClear = useMutation({
		mutationFn: async () => {
			if (!data?.id) throw new Error("User must be saved first.");
			return clearUserAvatar(data.id);
		},
		onSuccess: async (updated) => {
			setAvatarFile(null);
			setAvatarPreview(null);
			mergeUserCache(["user", id], updated);
			if (updated.id === currentUser?.id) {
				mergeUserCache(["user", "me"], updated);
			}
			await qc.invalidateQueries({ queryKey: ["user", id] });
			await qc.invalidateQueries({ queryKey: ["user", "me"] });
			await qc.invalidateQueries({ queryKey: ["users"] });
			await qc.invalidateQueries({ queryKey: ["audit-logs"] });
			showSuccess("Profile picture removed.");
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : "Failed to remove profile picture.");
		},
	});

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
		<Modal show={visible} onHide={remove} centered>
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
					{({ values, setFieldValue, validateForm, submitForm, setTouched }) => (
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
								<div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
									<span
										className="avatar avatar-xl"
										style={{
											backgroundImage: `url(${avatarPreview || data.avatar || "/images/default-avatar.jpg"})`,
										}}
									/>
									<div className="flex-grow-1" style={{ minWidth: 260 }}>
										<div className="text-secondary text-uppercase" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
											{intl.formatMessage({ id: "user.profile-picture" })}
										</div>
										<div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
											<input
												type="file"
												accept="image/png,image/jpeg,image/webp"
												onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
												className="form-control form-control-sm"
												style={{ width: 320 }}
												disabled={!data.id || avatarUpload.isPending || avatarClear.isPending}
											/>
											<Button
												size="sm"
												className="btn-orange"
												disabled={!data.id || !avatarFile || avatarUpload.isPending || avatarClear.isPending}
												isLoading={avatarUpload.isPending}
												onClick={() => avatarFile && avatarUpload.mutate(avatarFile)}
											>
												<T id="user.upload" />
											</Button>
											{isCustomAvatar ? (
												<Button
													size="sm"
													disabled={!data.id || avatarUpload.isPending || avatarClear.isPending}
													isLoading={avatarClear.isPending}
													onClick={() => avatarClear.mutate()}
												>
													<T id="user.remove" />
												</Button>
											) : null}
										</div>
										<div className="text-secondary mt-2" style={{ fontSize: 12, opacity: 0.85 }}>
											{intl.formatMessage({ id: "user.avatar-hint" })}
										</div>
									</div>
								</div>
								<div className="row">
									<div className="col-lg-6">
										<div className="mb-3">
											<Field name="name" validate={validateString(1, 50)}>
												{({ field, form }: any) => (
													<div className="form-floating mb-3">
														<input
															id="name"
															className={`form-control nyx-user-input-strong ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
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
															className={`form-control nyx-user-input-strong ${form.errors.nickname && form.touched.nickname ? "is-invalid" : ""}`}
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
													className={`form-control nyx-user-input-strong ${form.errors.email && form.touched.email ? "is-invalid" : ""}`}
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
													<span className="col">{intl.formatMessage({ id: "user.nyx-agent" })}</span>
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
									type="button"
									className="ms-auto btn-orange"
									isLoading={isSubmitting}
									disabled={isSubmitting}
									onClick={async () => {
										const errors = await validateForm();
										if (errors && Object.keys(errors).length > 0) {
											await setTouched(touchAllFields(values), true);
											setErrorMsg(firstFormikError(errors) || intl.formatMessage({ id: "error.required" }));
											return;
										}
										submitForm();
									}}
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
