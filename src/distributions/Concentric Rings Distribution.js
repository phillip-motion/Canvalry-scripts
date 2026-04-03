/*
  Concentric Rings Distribution
  Distributes points in concentric circles with configurable ring count,
  points per ring, and optional size falloff toward the centre.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Max Radius           (default: 300)
    n1  Ring Count           (default: 8)
    n2  Points Per Ring      (default: 20)
    n3  Size Falloff         (default: 0)    scale points smaller toward centre
                                              0 = uniform, 1 = full falloff
*/

function concentricRingsDistribution() {
    var maxRadius = (typeof n0 !== "undefined") ? n0 : 300;
    var ringCount = (typeof n1 !== "undefined") ? Math.max(Math.round(n1), 1) : 8;
    var pointsPerRing = (typeof n2 !== "undefined") ? Math.max(Math.round(n2), 1) : 20;
    var sizeFalloff = (typeof n3 !== "undefined") ? n3 : 0;

    var cloud = new cavalry.PointCloud();

    for (var ring = 0; ring < ringCount; ring += 1) {
        var r = maxRadius * (ring + 1) / ringCount;
        var t = (ring + 1) / ringCount;

        for (var p = 0; p < pointsPerRing; p += 1) {
            var angle = 2 * Math.PI * p / pointsPerRing;
            var px = r * Math.cos(angle);
            var py = r * Math.sin(angle);

            cloud.appendPoint(new cavalry.Point(px, py));

            if (sizeFalloff > 0) {
                var s = 1 - sizeFalloff * (1 - t);
                cloud.appendSize(new cavalry.Point(s, s));
            }
        }
    }

    return cloud;
}

concentricRingsDistribution();
