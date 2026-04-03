/*
  Phyllotaxis Distribution (Sunflower)
  Distributes points in a golden-angle spiral, producing the classic
  sunflower seed pattern. Each successive point is rotated by the golden
  angle (~137.5 degrees) and placed at increasing radius.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Point Count          (default: 500)
    n1  Spacing              (default: 10)   distance between rings
    n2  Size Falloff         (default: 0)    scale points by distance from centre
                                              0 = uniform, 1 = smaller at centre
*/

function phyllotaxisDistribution() {
    var count = (typeof n0 !== "undefined") ? Math.max(Math.round(n0), 1) : 500;
    var spacing = (typeof n1 !== "undefined") ? n1 : 10;
    var sizeFalloff = (typeof n2 !== "undefined") ? n2 : 0;

    var cloud = new cavalry.PointCloud();
    var goldenAngle = Math.PI * (3 - Math.sqrt(5));
    var maxR = spacing * Math.sqrt(count);

    for (var i = 0; i < count; i += 1) {
        var angle = i * goldenAngle;
        var r = spacing * Math.sqrt(i);

        var px = r * Math.cos(angle);
        var py = r * Math.sin(angle);

        cloud.appendPoint(new cavalry.Point(px, py));

        if (sizeFalloff > 0 && maxR > 0) {
            var t = r / maxR;
            var s = 1 - sizeFalloff * (1 - t);
            cloud.appendSize(new cavalry.Point(s, s));
        }
    }

    return cloud;
}

phyllotaxisDistribution();
