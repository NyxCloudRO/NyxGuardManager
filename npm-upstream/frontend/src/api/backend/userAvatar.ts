import { del, post } from "./base";
import type { User } from "./models";

export async function uploadUserAvatar(userId: number | string, avatar: File): Promise<User> {
	const fd = new FormData();
	fd.append("avatar", avatar, avatar.name);
	return post({ url: `/users/${userId}/avatar`, data: fd });
}

export async function clearUserAvatar(userId: number | string): Promise<User> {
	return del({ url: `/users/${userId}/avatar` });
}

