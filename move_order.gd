class_name MoveOrder
extends RefCounted
## Un ordre = une commande sérialisable. Le joueur n'agit jamais directement
## sur l'état : il envoie des ordres, la simulation les exécute.

var ship_id: int
var target: Vector3


static func create(p_ship_id: int, p_target: Vector3) -> MoveOrder:
	var o := MoveOrder.new()
	o.ship_id = p_ship_id
	o.target = p_target
	return o


# Pour le réseau (RPC) ou une sauvegarde.
func to_dict() -> Dictionary:
	return {"ship_id": ship_id, "target": [target.x, target.y, target.z]}


static func from_dict(d: Dictionary) -> MoveOrder:
	var t: Array = d["target"]
	return MoveOrder.create(d["ship_id"], Vector3(t[0], t[1], t[2]))
