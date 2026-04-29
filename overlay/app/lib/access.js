/**
 * Some Notes: This is a friggin complicated piece of code.
 *
 * "scope" in this file means "where did this token come from and what is using it", so 99% of the time
 * the "scope" is going to be "user" because it would be a user token. This is not to be confused with
 * the "role" which could be "user" or "admin". The scope in fact, could be "worker" or anything else.
 */

import Ajv from "ajv/dist/2020.js";
import _ from "lodash";
import { access as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import permsSchema from "./access/permissions.json" with { type: "json" };
import roleSchema from "./access/roles.json" with { type: "json" };
import errs from "./error.js";
import accessListsCreate from "./access/access_lists-create.json" with { type: "json" };
import accessListsDelete from "./access/access_lists-delete.json" with { type: "json" };
import accessListsGet from "./access/access_lists-get.json" with { type: "json" };
import accessListsList from "./access/access_lists-list.json" with { type: "json" };
import accessListsUpdate from "./access/access_lists-update.json" with { type: "json" };
import auditlogList from "./access/auditlog-list.json" with { type: "json" };
import certificatesCreate from "./access/certificates-create.json" with { type: "json" };
import certificatesDelete from "./access/certificates-delete.json" with { type: "json" };
import certificatesGet from "./access/certificates-get.json" with { type: "json" };
import certificatesList from "./access/certificates-list.json" with { type: "json" };
import certificatesUpdate from "./access/certificates-update.json" with { type: "json" };
import deadHostsCreate from "./access/dead_hosts-create.json" with { type: "json" };
import deadHostsDelete from "./access/dead_hosts-delete.json" with { type: "json" };
import deadHostsGet from "./access/dead_hosts-get.json" with { type: "json" };
import deadHostsList from "./access/dead_hosts-list.json" with { type: "json" };
import deadHostsUpdate from "./access/dead_hosts-update.json" with { type: "json" };
import proxyHostsCreate from "./access/proxy_hosts-create.json" with { type: "json" };
import proxyHostsDelete from "./access/proxy_hosts-delete.json" with { type: "json" };
import proxyHostsGet from "./access/proxy_hosts-get.json" with { type: "json" };
import proxyHostsList from "./access/proxy_hosts-list.json" with { type: "json" };
import proxyHostsUpdate from "./access/proxy_hosts-update.json" with { type: "json" };
import redirectionHostsCreate from "./access/redirection_hosts-create.json" with { type: "json" };
import redirectionHostsDelete from "./access/redirection_hosts-delete.json" with { type: "json" };
import redirectionHostsGet from "./access/redirection_hosts-get.json" with { type: "json" };
import redirectionHostsList from "./access/redirection_hosts-list.json" with { type: "json" };
import redirectionHostsUpdate from "./access/redirection_hosts-update.json" with { type: "json" };
import reportsHosts from "./access/reports-hosts.json" with { type: "json" };
import settingsGet from "./access/settings-get.json" with { type: "json" };
import settingsList from "./access/settings-list.json" with { type: "json" };
import settingsManage from "./access/settings-manage.json" with { type: "json" };
import settingsUpdate from "./access/settings-update.json" with { type: "json" };
import streamsCreate from "./access/streams-create.json" with { type: "json" };
import streamsDelete from "./access/streams-delete.json" with { type: "json" };
import streamsGet from "./access/streams-get.json" with { type: "json" };
import streamsList from "./access/streams-list.json" with { type: "json" };
import streamsUpdate from "./access/streams-update.json" with { type: "json" };
import nyxguardList from "./access/nyxguard-list.json" with { type: "json" };
import nyxguardUpdate from "./access/nyxguard-update.json" with { type: "json" };
import webControlsGet from "./access/web_controls-get.json" with { type: "json" };
import webControlsUpdate from "./access/web_controls-update.json" with { type: "json" };
import usersCreate from "./access/users-create.json" with { type: "json" };
import usersDelete from "./access/users-delete.json" with { type: "json" };
import usersGet from "./access/users-get.json" with { type: "json" };
import usersLoginas from "./access/users-loginas.json" with { type: "json" };
import usersList from "./access/users-list.json" with { type: "json" };
import usersPassword from "./access/users-password.json" with { type: "json" };
import usersPermissions from "./access/users-permissions.json" with { type: "json" };
import usersUpdate from "./access/users-update.json" with { type: "json" };


// Static map of all permission schemas keyed by permission label (e.g. "proxy_hosts:list").
// This replaces the dynamic fs.readFileSync path construction which was vulnerable to path traversal.
const PERMISSION_SCHEMAS = {
	"access_lists:create": accessListsCreate,
	"access_lists:delete": accessListsDelete,
	"access_lists:get": accessListsGet,
	"access_lists:list": accessListsList,
	"access_lists:update": accessListsUpdate,
	"auditlog:list": auditlogList,
	"certificates:create": certificatesCreate,
	"certificates:delete": certificatesDelete,
	"certificates:get": certificatesGet,
	"certificates:list": certificatesList,
	"certificates:update": certificatesUpdate,
	"dead_hosts:create": deadHostsCreate,
	"dead_hosts:delete": deadHostsDelete,
	"dead_hosts:get": deadHostsGet,
	"dead_hosts:list": deadHostsList,
	"dead_hosts:update": deadHostsUpdate,
	"proxy_hosts:create": proxyHostsCreate,
	"proxy_hosts:delete": proxyHostsDelete,
	"proxy_hosts:get": proxyHostsGet,
	"proxy_hosts:list": proxyHostsList,
	"proxy_hosts:manage": proxyHostsUpdate,
	"proxy_hosts:update": proxyHostsUpdate,
	"redirection_hosts:create": redirectionHostsCreate,
	"redirection_hosts:delete": redirectionHostsDelete,
	"redirection_hosts:get": redirectionHostsGet,
	"redirection_hosts:list": redirectionHostsList,
	"redirection_hosts:update": redirectionHostsUpdate,
	"reports:hosts": reportsHosts,
	"settings:get": settingsGet,
	"settings:list": settingsList,
	"settings:manage": settingsManage,
	"settings:update": settingsUpdate,
	"streams:create": streamsCreate,
	"streams:delete": streamsDelete,
	"streams:get": streamsGet,
	"streams:list": streamsList,
	"streams:update": streamsUpdate,
	"nyxguard:get": nyxguardList,
	"nyxguard:list": nyxguardList,
	"nyxguard:manage": nyxguardUpdate,
	"nyxguard:update": nyxguardUpdate,
	"web_controls:get": webControlsGet,
	"web_controls:list": webControlsGet,
	"web_controls:manage": webControlsUpdate,
	"web_controls:update": webControlsUpdate,
	"users:create": usersCreate,
	"users:delete": usersDelete,
	"users:get": usersGet,
	"users:loginas": usersLoginas,
	"users:list": usersList,
	"users:password": usersPassword,
	"users:permissions": usersPermissions,
	"users:update": usersUpdate,
};

export default function (tokenString) {
	const Token = TokenModel();
	let tokenData = null;
	let initialised = false;
	const objectCache = {};
	let allowInternalAccess = false;
	let userRoles = [];
	let permissions = {};

	/**
	 * Loads the Token object from the token string
	 *
	 * @returns {Promise}
	 */
	this.init = async () => {
		if (initialised) {
			return;
		}

		if (!tokenString) {
			throw new errs.PermissionError("Permission Denied");
		}

		tokenData = await Token.load(tokenString);

		// At this point we need to load the user from the DB and make sure they:
		// - exist (and not soft deleted)
		// - still have the appropriate scopes for this token
		// This is only required when the User ID is supplied or if the token scope has `user`
		if (
			tokenData.attrs?.id ||
			(typeof tokenData.scope !== "undefined" && _.indexOf(tokenData.scope, "user") !== -1)
		) {
			// Has token user id or token user scope
			const user = await userModel
				.query()
				.where("id", tokenData.attrs.id)
				.andWhere("is_deleted", 0)
				.andWhere("is_disabled", 0)
				.allowGraph("[permissions]")
				.withGraphFetched("[permissions]")
				.first();

			if (user) {
				// make sure user has all scopes of the token
				// The `user` role is not added against the user row, so we have to just add it here to get past this check.
				user.roles.push("user");

				let ok = true;
				_.forEach(tokenData.scope, (scope_item) => {
					if (_.indexOf(user.roles, scope_item) === -1) {
						ok = false;
					}
				});

				if (!ok) {
					throw new errs.AuthError("Invalid token scope for User");
				}
				initialised = true;
				userRoles = user.roles;
				permissions = user.permissions;
			} else {
				throw new errs.AuthError("User cannot be loaded for Token");
			}
		}
		initialised = true;
	};

	/**
	 * Fetches the object ids from the database, only once per object type, for this token.
	 * This only applies to USER token scopes, as all other tokens are not really bound
	 * by object scopes
	 *
	 * @param   {String} objectType
	 * @returns {Promise}
	 */
	this.loadObjects = async (objectType) => {
		let objects = null;

		if (Token.hasScope("user")) {
			if (typeof tokenData.attrs.id === "undefined" || !tokenData.attrs.id) {
				throw new errs.AuthError("User Token supplied without a User ID");
			}

			const tokenUserId = tokenData.attrs.id ? tokenData.attrs.id : 0;

			if (typeof objectCache[objectType] !== "undefined") {
				objects = objectCache[objectType];
			} else {
				switch (objectType) {
					// USERS - should only return yourself
					case "users":
						objects = tokenUserId ? [tokenUserId] : [];
						break;

					// Proxy Hosts
					case "proxy_hosts": {
						const query = proxyHostModel.query().select("id").andWhere("is_deleted", 0);

						if (permissions.visibility === "user") {
							query.andWhere("owner_user_id", tokenUserId);
						}

						const rows = await query;
						objects = [];
						_.forEach(rows, (ruleRow) => {
							objects.push(ruleRow.id);
						});

						// enum should not have less than 1 item
						if (!objects.length) {
							objects.push(0);
						}
						break;
					}
				}
				objectCache[objectType] = objects;
			}
		}
		return objects;
	};

	/**
	 * Creates a schema object on the fly with the IDs and other values required to be checked against the permissionSchema
	 *
	 * @param   {String} permissionLabel
	 * @returns {Object}
	 */
	this.getObjectSchema = async (permissionLabel) => {
		const baseObjectType = permissionLabel.split(":").shift();

		const schema = {
			$id: "objects",
			description: "Actor Properties",
			type: "object",
			additionalProperties: false,
			properties: {
				user_id: {
					anyOf: [
						{
							type: "number",
							enum: [Token.get("attrs")?.id ?? 0],
						},
					],
				},
				scope: {
					type: "string",
					pattern: `^${Token.get("scope")}$`,
				},
			},
		};

		const result = await this.loadObjects(baseObjectType);
		if (typeof result === "object" && result !== null) {
			schema.properties[baseObjectType] = {
				type: "number",
				enum: result,
				minimum: 1,
			};
		} else {
			schema.properties[baseObjectType] = {
				type: "number",
				minimum: 1,
			};
		}

		return schema;
	};

	// here:

	return {
		token: Token,

		/**
		 *
		 * @param   {Boolean}  [allowInternal]
		 * @returns {Promise}
		 */
		load: async (allowInternal) => {
			if (tokenString) {
				return await Token.load(tokenString);
			}
			allowInternalAccess = allowInternal;
			return allowInternal || null;
		},

		reloadObjects: this.loadObjects,

		/**
		 *
		 * @param {String}  permission
		 * @param {*}       [data]
		 * @returns {Promise}
		 */
		can: async (permission, data) => {
			if (allowInternalAccess === true) {
				return true;
			}

			try {
				await this.init();
				const objectSchema = await this.getObjectSchema(permission);

				const dataSchema = {
					[permission]: {
						data: data,
						scope: Token.get("scope"),
						roles: userRoles,
						permission_visibility: permissions.visibility,
						permission_proxy_hosts: permissions.proxy_hosts,
						permission_redirection_hosts: permissions.redirection_hosts,
						permission_dead_hosts: permissions.dead_hosts,
						permission_streams: permissions.streams,
						permission_access_lists: permissions.access_lists,
						permission_certificates: permissions.certificates,
						permission_nyxguard: permissions.nyxguard ?? permissions.proxy_hosts,
						permission_web_controls: permissions.web_controls ?? permissions.settings,
						permission_users: permissions.users,
						permission_auditlog: permissions.auditlog,
						permission_settings: permissions.settings,
					},
				};

				const permissionSchema = {
					$async: true,
					$id: "permissions",
					type: "object",
					additionalProperties: false,
					properties: {},
				};

				const permSchema = PERMISSION_SCHEMAS[permission];
				if (!permSchema) {
					throw new errs.AssertionFailedError(`Unknown permission: ${permission}`);
				}
				permissionSchema.properties[permission] = permSchema;

				const ajv = new Ajv({
					verbose: true,
					allErrors: true,
					breakOnError: true,
					coerceTypes: true,
					schemas: [roleSchema, permsSchema, objectSchema, permissionSchema],
				});

				const valid = await ajv.validate("permissions", dataSchema);
				return valid && dataSchema[permission];
			} catch (err) {
				err.permission = permission;
				err.permission_data = data;
				logger.error(permission, data, err.message);
				throw new errs.PermissionError("Permission Denied", err);
			}
		},
	};
}
