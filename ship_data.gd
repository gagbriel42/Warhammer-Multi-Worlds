class_name ShipData
extends RefCounted
## Données pures d'un vaisseau capital (aucun nœud, aucune scène).
## Unités stratégiques : 1 unité = 50 m en mode combat (voir BattleContext.SCALE).

const TYPES := {
	"frigate":    {"hull": 300.0,  "speed": 40.0, "detection": 25.0, "length_m": 80.0},
	"cruiser":    {"hull": 900.0,  "speed": 30.0, "detection": 30.0, "length_m": 200.0},
	"battleship": {"hull": 2000.0, "speed": 20.0, "detection": 35.0, "length_m": 400.0},
}

var id: int
var owner_id: int
var type: String
var position: Vector3
var hull: float
var max_hull: float
var speed: float            # distance max parcourue par tour
var detection_range: float  # portée de contact / de détection
var alive := true


static func create(p_id: int, p_owner: int, p_type: String, p_pos: Vector3) -> ShipData:
	var s := ShipData.new()
	var stats: Dictionary = TYPES[p_type]
	s.id = p_id
	s.owner_id = p_owner
	s.type = p_type
	s.position = p_pos
	s.max_hull = stats["hull"]
	s.hull = s.max_hull
	s.speed = stats["speed"]
	s.detection_range = stats["detection"]
	return s
