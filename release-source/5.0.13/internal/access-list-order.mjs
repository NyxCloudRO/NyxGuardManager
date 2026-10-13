// Nginx evaluates ACL rows in order. Parallel inserts cannot preserve that order.
export async function insertOrderedClients(insert,clients=[]){
 for(const client of clients){await insert(client)}
}
