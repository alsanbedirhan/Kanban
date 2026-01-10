using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class BoardColumn
{
    public long Id { get; set; }

    public long BoardId { get; set; }

    public string Title { get; set; } = null!;

    public bool IsActive { get; set; }

    public virtual Board Board { get; set; } = null!;

    public virtual ICollection<BoardCard> BoardCards { get; set; } = new List<BoardCard>();
}
