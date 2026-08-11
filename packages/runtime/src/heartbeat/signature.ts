/**
 * La signature du battement — **déplacée dans `packages/domain`**.
 *
 * Elle doit être partagée par deux runtimes : le worker Node et la fonction Deno (`D16`). Une
 * fonction serveur ne peut importer que le domaine et la configuration, et recopier une
 * vérification de signature en donnerait deux versions divergentes. Ce fichier ne garde que la
 * ré-exportation, pour que rien de ce qui l'importait n'ait à changer.
 */

export {
  DEFAULT_TOLERANCE_MS,
  HEARTBEAT_HEADER,
  signHeartbeat,
  verifyHeartbeat,
  type HeartbeatRejection,
  type SignatureVerdict,
} from "@sentio/domain";
