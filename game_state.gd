class_name GameState
extends RefCounted
## État complet de la campagne. Aucune logique d'affichage ici :
## c'est ce qu'un serveur détiendrait en multijoueur.

var turn := 1
var ships: Dictionary = {}   # id -> ShipData
var _next_id := 1


func add_ship(owner_id: int, type: String, pos: Vector3) -> ShipData:
	var s := ShipData.create(_next_id, owner_id, type, pos)
	ships[s.id] = s
	_next_id += 1
	return s


func ships_of(owner_id: int) -> Array[ShipData]:
	var out: Array[ShipData] = []
	for id in ships:
		var s: ShipData = ships[id]
		if s.owner_id == owner_id and s.alive:
			out.append(s)
	return out
