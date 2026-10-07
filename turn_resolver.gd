class_name TurnResolver
extends RefCounted
## Résolution d'un tour simultané : tous les ordres des deux camps sont
## exécutés en même temps, par petits pas. Un nouveau contact gèle les deux
## vaisseaux concernés et déclenche un combat.
## Fonction pure côté "serveur" : état + ordres -> frames + combats.

const SUBSTEPS := 30


# orders : Array[MoveOrder] de tous les joueurs fusionnés.
# (En réseau, le serveur doit vérifier que chaque ordre vise un vaisseau
# appartenant bien au joueur qui l'a envoyé.)
static func resolve(state: GameState, orders: Array) -> Dictionary:
	var targets := {}   # ship_id -> Vector3
	for o in orders:
		if state.ships.has(o.ship_id):
			targets[o.ship_id] = o.target

	var ids: Array = state.ships.keys()
	ids.sort()   # ordre fixe = résultat déterministe

	var prior := _pairs_in_range(state, ids)   # engagements déjà en cours
	var pairs := {}                            # combats à lancer
	var frozen := {}                           # vaisseaux arrêtés par un contact
	var frames: Array = []                     # positions à chaque pas (animation)

	for _step in SUBSTEPS:
		for id in ids:
			var s: ShipData = state.ships[id]
			if not s.alive or frozen.has(id) or not targets.has(id):
				continue
			var to_target: Vector3 = targets[id] - s.position
			var max_step: float = s.speed / SUBSTEPS
			if to_target.length() <= max_step:
				s.position = targets[id]
				targets.erase(id)
			else:
				s.position += to_target.normalized() * max_step

		# Nouveaux contacts : combat + arrêt des deux vaisseaux.
		var now := _pairs_in_range(state, ids)
		for key in now:
			if prior.has(key):
				continue
			pairs[key] = now[key]
			for id in now[key]:
				frozen[id] = true

		frames.append(_snapshot(state, ids))

	# Engagements déjà en cours : ils peuvent rompre le contact en s'éloignant.
	# Si à la fin du tour on est toujours à portée, le combat continue.
	var still := _pairs_in_range(state, ids)
	for key in still:
		if prior.has(key):
			pairs[key] = still[key]

	return {"frames": frames, "battles": _group_battles(pairs)}


static func _pairs_in_range(state: GameState, ids: Array) -> Dictionary:
	var out := {}
	for i in ids.size():
		var a: ShipData = state.ships[ids[i]]
		if not a.alive:
			continue
		for j in range(i + 1, ids.size()):
			var b: ShipData = state.ships[ids[j]]
			if not b.alive or a.owner_id == b.owner_id:
				continue
			var reach := maxf(a.detection_range, b.detection_range)
			if a.position.distance_to(b.position) <= reach:
				out["%d_%d" % [a.id, b.id]] = [a.id, b.id]
	return out


static func _snapshot(state: GameState, ids: Array) -> Dictionary:
	var snap := {}
	for id in ids:
		snap[id] = state.ships[id].position
	return snap


# Regroupe les paires en contact en batailles (composantes connexes) :
# si A touche B et B touche C, A, B et C sont dans la même bataille.
static func _group_battles(pairs: Dictionary) -> Array:
	var parent := {}
	for key in pairs:
		for id in pairs[key]:
			parent[id] = id
	for key in pairs:
		var a := _find(parent, pairs[key][0])
		var b := _find(parent, pairs[key][1])
		if a != b:
			parent[a] = b
	var groups := {}
	for id in parent:
		var root := _find(parent, id)
		if not groups.has(root):
			groups[root] = []
		groups[root].append(id)
	return groups.values()


static func _find(parent: Dictionary, id: int) -> int:
	while parent[id] != id:
		id = parent[id]
	return id
